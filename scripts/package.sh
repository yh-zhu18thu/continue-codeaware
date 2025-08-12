
# Call this script to package the project into a .vsix file.
# This script should be run from the root of the project.

# Build GUI
cd gui
npm run build
cd ..

# Build VSCode extension
cd extensions/vscode
npm run package-all
cd ../..


# To install the extension, you can use the following command:
# code --install-extension codeaware-extension.vsix
