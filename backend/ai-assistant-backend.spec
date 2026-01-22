# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for AI Assistant Backend
This file configures how PyInstaller packages the FastAPI application into a standalone executable.
"""

from PyInstaller.utils.hooks import collect_all

# Initialize collections for data files, binaries, and hidden imports
datas = []
binaries = []
hiddenimports = []

# Collect all uvicorn dependencies
# Uvicorn is the ASGI server that runs FastAPI
tmp_ret = collect_all('uvicorn')
datas += tmp_ret[0]
binaries += tmp_ret[1]
hiddenimports += tmp_ret[2]

# Collect all FastAPI dependencies
tmp_ret = collect_all('fastapi')
datas += tmp_ret[0]
binaries += tmp_ret[1]
hiddenimports += tmp_ret[2]

# Collect all Starlette dependencies (FastAPI is built on Starlette)
tmp_ret = collect_all('starlette')
datas += tmp_ret[0]
binaries += tmp_ret[1]
hiddenimports += tmp_ret[2]

# Add explicit hidden imports for uvicorn modules that are loaded dynamically
hiddenimports += [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
]

# Add explicit hidden imports for Pydantic (used by FastAPI for data validation)
hiddenimports += [
    'pydantic',
    'pydantic.fields',
    'pydantic.main',
    'pydantic.types',
    'pydantic.validators',
]

# Analysis: Analyze the Python script and all its dependencies
a = Analysis(
    ['src/main.py'],              # Entry point script
    pathex=[],                     # Additional paths to search for imports
    binaries=binaries,             # Binary files to include
    datas=datas,                   # Data files to include
    hiddenimports=hiddenimports,   # Modules to import that PyInstaller might miss
    hookspath=[],                  # Additional hook directories
    hooksconfig={},                # Hook configuration
    runtime_hooks=[],              # Scripts to run at runtime before main script
    excludes=[],                   # Modules to exclude
    noarchive=False,               # Whether to not use archive
    optimize=0,                    # Bytecode optimization level (0=none, 1=basic, 2=extra)
)

# PYZ: Create a Python ZIP archive containing all pure Python modules
pyz = PYZ(a.pure)

# EXE: Create the final executable
exe = EXE(
    pyz,                                    # The PYZ archive
    a.scripts,                              # Scripts to include
    a.binaries,                             # Binary dependencies
    a.datas,                                # Data files
    [],                                     # Additional files
    name='ai-assistant-backend',            # Name of the executable
    debug=False,                            # Enable debug output
    bootloader_ignore_signals=False,        # Bootloader signal handling
    strip=False,                            # Strip symbols from binaries (Linux/Mac)
    upx=True,                               # Compress with UPX
    upx_exclude=[],                         # Files to exclude from UPX compression
    runtime_tmpdir=None,                    # Runtime temporary directory
    console=True,                           # Show console window (required for server)
    disable_windowed_traceback=False,       # Disable traceback in windowed mode
    argv_emulation=False,                   # Emulate argv (macOS)
    target_arch=None,                       # Target architecture (None=current)
    codesign_identity=None,                 # Code signing identity (macOS)
    entitlements_file=None,                 # Entitlements file (macOS)
)
