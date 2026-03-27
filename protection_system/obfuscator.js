const bytenode = require('bytenode');
const fs = require('fs');
const path = require('path');

/**
 * Compiles a JavaScript file into V8 Bytecode (.jsc).
 * @param {string} inputFile - Path to the source .js file
 * @param {string} outputFile - Path for the output .jsc file
 */
function compileFile(inputFile, outputFile) {
    try {
        if (!fs.existsSync(inputFile)) {
            console.error(`Error: Input file '${inputFile}' not found.`);
            process.exit(1);
        }

        console.log(`Compiling ${inputFile} to bytecode...`);

        // Compile the file
        bytenode.compileFile(inputFile, outputFile);

        console.log(`Success! Bytecode saved to ${outputFile}`);

        // Generate a loader script
        const loaderPath = inputFile.replace('.js', '.loader.js');
        const loaderCode = `
            const bytenode = require('bytenode');
            require('./${path.basename(outputFile)}');
        `;

        fs.writeFileSync(loaderPath, loaderCode);
        console.log(`Loader script created at ${loaderPath}`);
        console.log("NOTE: You must bundle 'bytenode' with your application for this to run.\n");

    } catch (error) {
        console.error("Compilation failed:", error);
    }
}

// Check arguments
const args = process.argv.slice(2);
if (args.length < 1) {
    console.log("Usage: node obfuscator.js <input_file.js> [output_file.jsc]");
    process.exit(0);
}

const input = args[0];
const output = args[1] || input.replace('.js', '.jsc');

compileFile(input, output);
