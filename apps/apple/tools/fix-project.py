"""After `xcodegen generate`: make sure Xcode reads Budgie/AppIcon.icon as an Icon Composer icon (and compiles it into
the app's icons), not as a plain folder to copy. Older XcodeGen versions don't know the .icon type.

Usage: python3 apps/apple/tools/fix-project.py
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PBX = os.path.join(os.path.dirname(HERE), 'Budgie.xcodeproj', 'project.pbxproj')
text = open(PBX).read()
refs = re.findall(r'^\s*\w+ /\* AppIcon\.icon \*/ = \{isa = PBXFileReference;[^\n]*\};$', text, re.M)
if not refs:
    sys.exit('fix-project: AppIcon.icon is not in the project')
fixed = text
for ref in refs:
    new = re.sub(r'(lastKnownFileType|explicitFileType) = [^;]+;', 'lastKnownFileType = folder.iconcomposer.icon;', ref)
    if 'folder.iconcomposer.icon' not in new:
        new = new.replace('isa = PBXFileReference;', 'isa = PBXFileReference; lastKnownFileType = folder.iconcomposer.icon;')
    fixed = fixed.replace(ref, new)
if 'AppIcon.icon in Resources' not in fixed:
    sys.exit('fix-project: AppIcon.icon is not in Copy Bundle Resources')
open(PBX, 'w').write(fixed)
print('fix-project: AppIcon.icon is an Icon Composer icon' + (' (fixed)' if fixed != text else ''))
