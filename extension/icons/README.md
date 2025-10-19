# Icon Placeholder

The extension requires icon files in this directory:
- icon16.png (16x16 pixels)
- icon48.png (48x48 pixels)  
- icon128.png (128x128 pixels)

## Quick Solution: Use an Online Icon Generator

1. Visit https://www.favicon-generator.org/ or https://www.canva.com/
2. Create a simple icon with a magnifying glass 🔍 or shield 🛡️
3. Download in multiple sizes (16x16, 48x48, 128x128)
4. Place them in this `icons/` folder

## Or: Create with ImageMagick (if installed)

```bash
# Create simple placeholder icons
convert -size 128x128 xc:blue -pointsize 80 -fill white -gravity center -annotate +0+0 "🔍" icon128.png
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 16x16 icon16.png
```

## Temporary Fix

The extension will still work without icons, but Chrome will show a placeholder icon.
You can remove the "icons" section from manifest.json if needed.
