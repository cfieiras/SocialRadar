$version = "1.1.7"
$appName = "SocialRadar"
$buildDirName = "chrome-mv3-prod"
$targetName = "$appName-v$version"
$zipName = "$targetName.zip"

Write-Host "Building project..."
npm run build

# Find where the build went
$possiblePaths = @(
    "..\extension-build\$buildDirName",
    "build\$buildDirName"
)

$sourcePath = $null
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $sourcePath = $path
        break
    }
}

if (-not $sourcePath) {
    Write-Error "Build directory not found!"
    exit 1
}

Write-Host "Build found at: $sourcePath"

# Prepare staging area
$stagingDir = "release_stage"
if (Test-Path $stagingDir) { Remove-Item -Recurse -Force $stagingDir }
New-Item -ItemType Directory -Path $stagingDir | Out-Null

# Copy build to staging with new name
$destPath = "$stagingDir\$targetName"
Copy-Item -Recurse -Path $sourcePath -Destination $destPath

# Copy Readme configuration
Copy-Item -Path "README.txt" -Destination "$destPath\README.txt"

# Remove existing zip if any
if (Test-Path $zipName) { Remove-Item -Force $zipName }

# Create Zip
$zipPath = "$PWD\$zipName"
Compress-Archive -Path "$destPath" -DestinationPath $zipPath -Force

Write-Host "SUCCESS! Release package created at: $zipPath"
