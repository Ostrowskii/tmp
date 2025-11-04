#!/bin/bash

# Build TypeScript files to JavaScript
echo "Building TypeScript files..."

bun build client_web.ts --outdir . --target=browser --format=esm
bun build state_machine.ts --outdir . --target=browser --format=esm
bun build letters.ts --outdir . --target=browser --format=esm

echo "Build complete! Open index.html in your browser."
