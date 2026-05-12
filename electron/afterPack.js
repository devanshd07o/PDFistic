const { execFileSync } = require('child_process')
const path = require('path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const appName = context.packager.appInfo.productName || 'PDFistic'
  const exePath = path.join(context.appOutDir, `${appName}.exe`)
  const rceditPath = path.join(context.packager.projectDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico')

  execFileSync(rceditPath, [
    exePath,
    '--set-version-string', 'ProductName', 'PDFistic',
    '--set-version-string', 'FileDescription', 'PDFistic PDF Reader',
    '--set-version-string', 'CompanyName', 'PDFistic',
    '--set-version-string', 'InternalName', 'PDFistic',
    '--set-version-string', 'OriginalFilename', 'PDFistic.exe',
    '--set-icon', iconPath
  ], { stdio: 'inherit' })
}
