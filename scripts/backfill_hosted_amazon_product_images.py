import argparse
import base64
import json
import os
import posixpath
import re
import shlex
import time
import urllib.parse
import urllib.request
from html import unescape

import paramiko


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)


def extract_asin(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""

    match = re.search(r"\b((?:B[0-9A-Z]{9}|\d{10}))\b", text.upper())
    if match:
        candidate = match.group(1)
        if any(char.isdigit() for char in candidate):
            return candidate

    return ""


def is_amazon_product_url(value: str) -> bool:
    raw = (value or "").strip()
    if not raw:
        return False
    try:
        parsed = urllib.parse.urlparse(raw)
    except Exception:
        return False
    if not re.search(r"(^|\.)amazon\.", parsed.netloc, re.I):
        return False
    return bool(extract_asin(raw))


def normalize_amazon_image_url(url: str) -> str:
    normalized = (url or "").strip()
    if not normalized:
        return ""
    normalized = normalized.replace("\\u002F", "/").replace("\\/", "/")
    return re.sub(r"\._[^.]+_\.(jpg|jpeg|png|webp)$", r"._AC_SL1500_.\1", normalized, flags=re.I)


def amazon_dimension_hint(url: str) -> int:
    url = normalize_amazon_image_url(url)
    if not url:
        return 0
    if "LZZZZZZZ" in url.upper():
        return 0
    sizes = [int(value) for value in re.findall(r"(?:AC_)?(?:UL|UX|UY|US|SL|SX|SY|SS)(\d{2,4})", url, re.I)]
    if sizes:
        return max(sizes)
    if "media-amazon.com" in url:
        return 480
    return 0


def is_usable_amazon_image_url(url: str, minimum_size: int = 220) -> bool:
    return amazon_dimension_hint(url) >= minimum_size


def request_bytes(url: str, accept: str = "*/*") -> tuple[bytes, dict]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": accept,
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=40) as response:
        return response.read(), dict(response.info())


def fetch_proxy_html(target_url: str) -> str:
    proxy_url = "https://www.postgeniuspro.com/api/proxy.php?url=" + urllib.parse.quote(target_url, safe="")
    body, _headers = request_bytes(proxy_url, accept="text/html,application/xhtml+xml")
    return body.decode("utf-8", "ignore")


def extract_dynamic_image_candidates(raw_value: str) -> list[tuple[str, int]]:
    decoded = unescape((raw_value or "").replace("\\u002F", "/").replace("\\/", "/"))
    if not decoded:
        return []

    candidates: list[tuple[str, int]] = []
    for match in re.finditer(
        r'(https://m\.media-amazon\.com/images/I/[^"\',\s}]+)"?\s*:\s*\[(\d+),\s*(\d+)\]',
        decoded,
        re.I,
    ):
        url = normalize_amazon_image_url(match.group(1))
        score = max(int(match.group(2)), int(match.group(3)))
        if url:
            candidates.append((url, score))
    return candidates


def extract_proxy_image_candidates(html: str) -> list[str]:
    candidates: list[tuple[str, int]] = []

    for raw in re.findall(r'data-a-dynamic-image="([^"]+)"', html, re.I):
        candidates.extend(extract_dynamic_image_candidates(raw))

    for raw in re.findall(r'data-old-hires="([^"]+)"', html, re.I):
        url = normalize_amazon_image_url(unescape(raw))
        if url:
            candidates.append((url, amazon_dimension_hint(url)))

    for raw in re.findall(r'"(?:hiRes|large|mainUrl)":"([^"]+)"', html, re.I):
        url = normalize_amazon_image_url(unescape(raw))
        if url:
            candidates.append((url, amazon_dimension_hint(url)))

    # Lowest-priority fallback: generic media URLs found anywhere in the HTML.
    for raw in re.findall(r'https://m\.media-amazon\.com/images/I/[^"\'\s)]+?\.(?:jpe?g|png|webp)', html, re.I):
        url = normalize_amazon_image_url(raw)
        if url:
            candidates.append((url, amazon_dimension_hint(url)))

    ranked: list[tuple[str, int]] = []
    seen: set[str] = set()
    for url, score in sorted(candidates, key=lambda item: item[1], reverse=True):
        if not url or url in seen:
            continue
        seen.add(url)
        if re.search(r"sprite|nav-|loading-|pixel|logo|badge|icon|coupon|video|play-icon|swatch", url, re.I):
            continue
        if not is_usable_amazon_image_url(url):
            continue
        ranked.append((url, score))

    return [url for url, _score in ranked]


def sniff_image_type(data: bytes, content_type: str) -> str:
    content_type = (content_type or "").lower()
    if data.startswith(b"\xff\xd8\xff") or "jpeg" in content_type or "jpg" in content_type:
        return "jpg"
    if data.startswith(b"\x89PNG") or "png" in content_type:
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP" or "webp" in content_type:
        return "webp"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a") or "gif" in content_type:
        return "gif"
    return "jpg"


def read_image_dimensions(data: bytes, image_type: str) -> tuple[int, int]:
    try:
        if image_type == "png" and len(data) >= 24:
            width = int.from_bytes(data[16:20], "big")
            height = int.from_bytes(data[20:24], "big")
            return width, height

        if image_type == "gif" and len(data) >= 10:
            width = int.from_bytes(data[6:8], "little")
            height = int.from_bytes(data[8:10], "little")
            return width, height

        if image_type == "webp" and len(data) >= 30:
            if data[12:16] == b"VP8 ":
                width = int.from_bytes(data[26:28], "little") & 0x3FFF
                height = int.from_bytes(data[28:30], "little") & 0x3FFF
                return width, height
            if data[12:16] == b"VP8L":
                b0, b1, b2, b3 = data[21:25]
                width = 1 + (((b1 & 0x3F) << 8) | b0)
                height = 1 + (((b3 & 0x0F) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6))
                return width, height
            if data[12:16] == b"VP8X":
                width = 1 + int.from_bytes(data[24:27], "little")
                height = 1 + int.from_bytes(data[27:30], "little")
                return width, height

        if image_type == "jpg":
            index = 2
            size = len(data)
            while index < size:
                if data[index] != 0xFF:
                    index += 1
                    continue
                marker = data[index + 1]
                index += 2
                if marker in {0xD8, 0xD9}:
                    continue
                segment_length = int.from_bytes(data[index:index + 2], "big")
                if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                    height = int.from_bytes(data[index + 3:index + 5], "big")
                    width = int.from_bytes(data[index + 5:index + 7], "big")
                    return width, height
                index += segment_length
    except Exception:
        return 0, 0

    return 0, 0


def fetch_image_bytes(candidate_url: str) -> tuple[bytes, str] | tuple[None, None]:
    proxy_url = "https://www.postgeniuspro.com/api/proxy.php?url=" + urllib.parse.quote(candidate_url, safe="")
    try:
        data, headers = request_bytes(proxy_url, accept="image/*,*/*;q=0.8")
    except Exception:
        return None, None

    content_type = str(headers.get("Content-Type") or headers.get("content-type") or "")
    if "svg" in content_type.lower() or "gif" in content_type.lower():
        return None, None

    image_type = sniff_image_type(data, content_type)
    width, height = read_image_dimensions(data, image_type)
    if len(data) < 4096 or width < 220 or height < 220:
        return None, None

    return data, image_type


def replace_product_block_image(html: str, product_id: str, public_url: str) -> str:
    if not html or not product_id or not public_url:
        return html

    pattern = re.compile(
        rf'(<(?:article|div)[^>]*data-product-id="{re.escape(product_id)}"[^>]*>.*?<img\b[^>]*\bsrc=")([^"]*)(")',
        re.I | re.S,
    )

    return pattern.sub(lambda match: match.group(1) + public_url + match.group(3), html)


def resolve_product_image(product: dict) -> tuple[bytes, str, str] | tuple[None, None, None]:
    product_url = str(product.get("url") or "").strip()
    explicit_asin = str(product.get("asin") or product.get("ASIN") or "").strip()
    asin = extract_asin(explicit_asin) or extract_asin(product_url)

    page_urls = []
    if is_amazon_product_url(product_url):
        page_urls.append(product_url)
    if asin:
        page_urls.extend([
            f"https://www.amazon.com/gp/aw/d/{asin}",
            f"https://www.amazon.com/dp/{asin}",
        ])

    seen_pages: set[str] = set()
    for page_url in page_urls:
        if not page_url or page_url in seen_pages:
            continue
        seen_pages.add(page_url)
        try:
            html = fetch_proxy_html(page_url)
        except Exception:
            continue
        for candidate in extract_proxy_image_candidates(html):
            result = fetch_image_bytes(candidate)
            if result[0]:
                return result[0], result[1], candidate

    direct_candidate = normalize_amazon_image_url(str(product.get("imageUrl") or "").strip())
    if direct_candidate and re.search(r"(^|\.)amazon\.", urllib.parse.urlparse(direct_candidate).netloc, re.I) and is_usable_amazon_image_url(direct_candidate):
        result = fetch_image_bytes(direct_candidate)
        if result[0]:
            return result[0], result[1], direct_candidate

    return None, None, None


def run_remote_command(ssh: paramiko.SSHClient, command: str) -> str:
    stdin, stdout, stderr = ssh.exec_command(command)
    output = stdout.read().decode("utf-8", "ignore")
    error = stderr.read().decode("utf-8", "ignore")
    if stderr.channel.recv_exit_status() != 0:
        raise RuntimeError(error.strip() or output.strip() or f"Remote command failed: {command}")
    return output


def shell_quote(value: str) -> str:
    return shlex.quote(str(value))


def build_mysql_command(args: argparse.Namespace, sql: str) -> str:
    return (
        "mariadb --batch --raw --skip-column-names "
        f"-u {shell_quote(args.db_user)} "
        f"-p{shell_quote(args.db_pass)} "
        f"-D {shell_quote(args.db_name)} "
        f"-e {shell_quote(sql)}"
    )


def fetch_rows(ssh: paramiko.SSHClient, args: argparse.Namespace) -> list[dict]:
    where_clause = "LOWER(status)='published'"
    if args.slug:
        sanitized_slug = args.slug.replace("'", "''")
        where_clause += f" AND slug='{sanitized_slug}'"

    sql = f"""
    SELECT JSON_OBJECT(
        'id', COALESCE(id, ''),
        'slug', COALESCE(slug, ''),
        'title', COALESCE(title, ''),
        'content', COALESCE(content, ''),
        'generated_html', COALESCE(generated_html, '')
    )
    FROM articles
    WHERE {where_clause};
    """

    output = run_remote_command(ssh, build_mysql_command(args, sql))
    rows: list[dict] = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


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

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(args.host, port=args.port, username=args.user, password=args.password, timeout=20)
    sftp = ssh.open_sftp()

    backup_dir = f"/home/{args.user}/deploy_backups/hosted_amazon_product_backfill_{time.strftime('%Y%m%d_%H%M%S')}"
    ssh.exec_command(f"mkdir -p {backup_dir}")

    rows = fetch_rows(ssh, args)

    original_rows = []
    updated_rows = []
    processed_products = 0
    hosted_products = 0

    for row in rows:
        try:
            content = json.loads(row.get("content") or "{}")
        except Exception:
            continue

        product_data = list(content.get("productData") or [])
        if not product_data:
            continue

        changed = False

        raw_product_image_urls = content.get("productImageUrls") or {}
        if isinstance(raw_product_image_urls, list):
            product_image_urls = {
                str(product.get("id") or index): str(url).strip()
                for index, (product, url) in enumerate(zip(product_data, raw_product_image_urls))
                if isinstance(product, dict) and str(url).strip()
            }
            changed = True
        elif isinstance(raw_product_image_urls, dict):
            product_image_urls = dict(raw_product_image_urls)
        else:
            product_image_urls = {}
        blog_post_data = content.get("blogPostData") or {}
        raw_blog_post_image_urls = blog_post_data.get("productImageUrls") or {}
        if isinstance(raw_blog_post_image_urls, list):
            blog_post_image_urls = {
                str(product.get("id") or index): str(url).strip()
                for index, (product, url) in enumerate(zip(product_data, raw_blog_post_image_urls))
                if isinstance(product, dict) and str(url).strip()
            }
            changed = True
        elif isinstance(raw_blog_post_image_urls, dict):
            blog_post_image_urls = dict(raw_blog_post_image_urls)
        else:
            blog_post_image_urls = {}
        generated_html = str(row.get("generated_html") or "")

        for product in product_data:
            product_id = str(product.get("id") or "").strip()
            if not product_id:
                continue

            processed_products += 1
            resolved = resolve_product_image(product)
            if not resolved[0]:
                continue

            image_bytes, extension, source_url = resolved
            remote_dir = f"/home/{args.user}/domains/postgeniuspro.com/public_html/api/uploads/{row['id']}"
            remote_path = posixpath.join(remote_dir, f"product_{product_id}.{extension}")
            public_url = f"https://www.postgeniuspro.com/api/uploads/{row['id']}/product_{product_id}.{extension}"

            ssh.exec_command(f"mkdir -p {remote_dir}")
            with sftp.open(remote_path, "wb") as handle:
                handle.write(image_bytes)

            product_image_urls[product_id] = public_url
            blog_post_image_urls[product_id] = public_url
            product["imageUrl"] = public_url
            generated_html = replace_product_block_image(generated_html, product_id, public_url)
            hosted_products += 1
            changed = True

        if not changed:
            continue

        content["productData"] = product_data
        content["productImageUrls"] = product_image_urls
        if isinstance(blog_post_data, dict):
            blog_post_data["productImageUrls"] = blog_post_image_urls
            content["blogPostData"] = blog_post_data

        original_rows.append(row)
        updated_rows.append({
            "id": row["id"],
            "slug": row["slug"],
            "content": json.dumps(content, ensure_ascii=False, separators=(",", ":")),
            "generated_html": generated_html,
        })

    if original_rows:
        with sftp.open(posixpath.join(backup_dir, "original_rows.json"), "w") as handle:
            handle.write(json.dumps(original_rows, ensure_ascii=False, indent=2))
        with sftp.open(posixpath.join(backup_dir, "updated_rows.json"), "w") as handle:
            handle.write(json.dumps(updated_rows, ensure_ascii=False, indent=2))

        sql_lines = ["SET NAMES utf8mb4;"]
        for row in updated_rows:
            content_b64 = str(row["content"]).encode("utf-8")
            html_b64 = str(row["generated_html"]).encode("utf-8")
            id_b64 = str(row["id"]).encode("utf-8")
            sql_lines.append(
                "UPDATE articles "
                f"SET content=FROM_BASE64('{base64.b64encode(content_b64).decode('ascii')}'), "
                f"generated_html=FROM_BASE64('{base64.b64encode(html_b64).decode('ascii')}') "
                f"WHERE id=FROM_BASE64('{base64.b64encode(id_b64).decode('ascii')}');"
            )

        remote_sql_path = posixpath.join(backup_dir, "apply_updates.sql")
        with sftp.open(remote_sql_path, "w") as handle:
            handle.write("\n".join(sql_lines))

        run_remote_command(
            ssh,
            f"mariadb -u {shell_quote(args.db_user)} -p{shell_quote(args.db_pass)} -D {shell_quote(args.db_name)} < {shell_quote(remote_sql_path)}"
        )

    print(json.dumps({
        "backup_dir": backup_dir,
        "rows": len(rows),
        "updated_articles": len(updated_rows),
        "processed_products": processed_products,
        "hosted_products": hosted_products,
    }, ensure_ascii=False))

    sftp.close()
    ssh.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
