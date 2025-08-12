
# Call this script to package the project into a .vsix file.
# This script should be run from the root of the project.

# Build GUI
Push-Location gui
npm run build
Pop-Location

# Build VSCode extension
Push-Location extensions/vscode
npm run package
Pop-Location

# Copy the .vsix file to the root directory
Copy-Item "extensions/vscode/build/continue-*.vsix" "codeaware-extension.vsix"

# To install the extension, you can use the following command:
# code --install-extension codeaware-extension.vsix