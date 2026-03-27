import argparse
import base64
import json
import os
import posixpath
import shlex
import subprocess
import sys
import tempfile
import time

import paramiko


def run_remote_command(ssh: paramiko.SSHClient, command: str) -> str:
    stdin, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode("utf-8", "ignore")
    error = stderr.read().decode("utf-8", "ignore")
    if error.strip():
        raise RuntimeError(error.strip())
    return output


def write_remote_json(sftp: paramiko.SFTPClient, path: str, payload: object) -> None:
    with sftp.open(path, "w") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, indent=2))


def shell_quote(value: str) -> str:
    return shlex.quote(str(value))


def encode_base64_sql_value(value: str) -> str:
    return base64.b64encode((value or "").encode("utf-8")).decode("ascii")


def decode_base64_sql_value(value: str | None) -> str:
    if not value:
        return ""
    return base64.b64decode(value.encode("ascii")).decode("utf-8", "replace")


def build_mysql_command(args: argparse.Namespace, sql: str) -> str:
    return (
        "mariadb --batch --raw --skip-column-names "
        f"-u {shell_quote(args.db_user)} "
        f"-p{shell_quote(args.db_pass)} "
        f"-D {shell_quote(args.db_name)} "
        f"-e {shell_quote(sql)}"
    )


def fetch_rows(ssh: paramiko.SSHClient, args: argparse.Namespace) -> list[dict]:
    where_clause = "LOWER(status)='published' AND blueprint_type='review'"
    if args.slug:
        slug_value = args.slug.replace("'", "''")
        where_clause += f" AND slug='{slug_value}'"

    sql = f"""
    SELECT
      JSON_OBJECT(
        'id', COALESCE(id, ''),
        'slug', COALESCE(slug, ''),
        'title', COALESCE(title, ''),
        'blueprint_type', COALESCE(blueprint_type, ''),
        'content', COALESCE(content, ''),
        'generated_html', COALESCE(generated_html, ''),
        'image_url', COALESCE(image_url, ''),
        'style_config', COALESCE(style_config, '')
      )
    FROM articles
    WHERE {where_clause};
    """

    output = run_remote_command(ssh, build_mysql_command(args, sql))
    rows: list[dict] = []
    for line in output.splitlines():
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        rows.append({
            "id": payload.get("id", ""),
            "slug": payload.get("slug", ""),
            "title": payload.get("title", ""),
            "blueprint_type": payload.get("blueprint_type", ""),
            "content": payload.get("content", ""),
            "generated_html": payload.get("generated_html", ""),
            "image_url": payload.get("image_url", ""),
            "style_config": payload.get("style_config", ""),
        })
    return rows


def apply_updates(
    ssh: paramiko.SSHClient,
    sftp: paramiko.SFTPClient,
    args: argparse.Namespace,
    backup_dir: str,
    updated_rows: list[dict]
) -> int:
    if not updated_rows:
        return 0

    sql_lines = ["SET NAMES utf8mb4;"]
    for row in updated_rows:
        sql_lines.append(
            "UPDATE articles "
            f"SET content=FROM_BASE64('{encode_base64_sql_value(row['content'])}'), "
            f"generated_html=FROM_BASE64('{encode_base64_sql_value(row['generated_html'])}'), "
            "updated_at=NOW() "
            f"WHERE id=FROM_BASE64('{encode_base64_sql_value(row['id'])}');"
        )

    remote_sql_path = posixpath.join(backup_dir, "apply_updates.sql")
    with sftp.open(remote_sql_path, "w") as handle:
        handle.write("\n".join(sql_lines))
    run_remote_command(
        ssh,
        f"mariadb -u {shell_quote(args.db_user)} -p{shell_quote(args.db_pass)} -D {shell_quote(args.db_name)} < {shell_quote(remote_sql_path)}"
    )
    return len(updated_rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--db-name", required=True)
    parser.add_argument("--db-user", required=True)
    parser.add_argument("--db-pass", required=True)
    parser.add_argument("--slug", default="")
    args = parser.parse_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(args.host, port=args.port, username=args.user, password=args.password, timeout=20)
    sftp = ssh.open_sftp()

    backup_dir = f"/home/{args.user}/deploy_backups/mixed_family_review_fix_{time.strftime('%Y%m%d_%H%M%S')}"
    ssh.exec_command(f"mkdir -p {backup_dir}")

    rows = fetch_rows(ssh, args)

    with tempfile.TemporaryDirectory() as tmp_dir:
        input_path = os.path.join(tmp_dir, "published_reviews.json")
        output_path = os.path.join(tmp_dir, "mixed_family_fix.json")

        with open(input_path, "w", encoding="utf-8") as handle:
            json.dump(rows, handle, ensure_ascii=False, indent=2)

        npx_command = "npx.cmd" if os.name == "nt" else "npx"
        command = [
            npx_command,
            "tsx",
            "scripts/fix_mixed_family_review_articles.ts",
            input_path,
            output_path,
        ]
        completed = subprocess.run(
            command,
            cwd=repo_root,
            capture_output=True,
            text=True,
            check=True,
        )

        with open(output_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)

    results = payload.get("results") or []
    result_map = {item["id"]: item for item in results}
    original_rows = [row for row in rows if row.get("id") in result_map]
    updated_rows = [
        {
            "id": item["id"],
            "slug": item["slug"],
            "content": json.dumps(item["content"], ensure_ascii=False, separators=(",", ":")),
            "generated_html": item["generated_html"],
        }
        for item in results
    ]

    write_remote_json(sftp, posixpath.join(backup_dir, "original_rows.json"), original_rows)
    write_remote_json(sftp, posixpath.join(backup_dir, "updated_rows.json"), updated_rows)
    write_remote_json(sftp, posixpath.join(backup_dir, "summary.json"), payload)

    update_result = {"updated": apply_updates(ssh, sftp, args, backup_dir, updated_rows)}

    print(json.dumps({
        "backup_dir": backup_dir,
        "fetched_rows": len(rows),
        "affected_rows": len(results),
        "updated_rows": update_result.get("updated", 0),
        "stdout": completed.stdout.strip(),
    }, ensure_ascii=False, indent=2))

    sftp.close()
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
