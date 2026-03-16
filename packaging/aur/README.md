# AUR Packaging (binary)

This directory contains a starter package for publishing LitGit Desktop to AUR
using the `.deb` asset from GitHub Releases.

## Files

- `PKGBUILD` - AUR package recipe (`litgit-desktop-bin`)
- `litgit-desktop-bin.install` - icon cache and desktop database hooks

## Update for a new release

1. Update `pkgver` (and `pkgrel` if needed) in `PKGBUILD`.
2. Regenerate checksums:
   ```bash
   updpkgsums
   ```
3. Generate `.SRCINFO`:
   ```bash
   makepkg --printsrcinfo > .SRCINFO
   ```
4. Test locally:
   ```bash
   makepkg -si
   ```

## Publish to AUR

```bash
git clone ssh://aur@aur.archlinux.org/litgit-desktop-bin.git
cp PKGBUILD litgit-desktop-bin.install .SRCINFO litgit-desktop-bin/
cd litgit-desktop-bin
git add .
git commit -m "release: v<version>"
git push
```
