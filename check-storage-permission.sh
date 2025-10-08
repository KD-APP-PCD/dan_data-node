#!/bin/bash

echo "🔍 CHECKING STORAGE DIRECTORY PERMISSIONS"
echo "=========================================="
echo ""

STORAGE_DIR="./storage"

# Check if storage directory exists
if [ ! -d "$STORAGE_DIR" ]; then
  echo "❌ Storage directory does NOT exist: $STORAGE_DIR"
  echo ""
  echo "Creating storage directory..."
  mkdir -p "$STORAGE_DIR"
  chmod 755 "$STORAGE_DIR"
  echo "✅ Storage directory created"
else
  echo "✅ Storage directory exists: $STORAGE_DIR"
fi

echo ""
echo "📊 Directory Information:"
echo "----------------------------------------"
ls -la "$STORAGE_DIR" | head -1
ls -ld "$STORAGE_DIR"

echo ""
echo "🔐 Permissions:"
echo "----------------------------------------"
PERMS=$(stat -f "%Sp" "$STORAGE_DIR" 2>/dev/null || stat -c "%A" "$STORAGE_DIR" 2>/dev/null)
OWNER=$(stat -f "%Su" "$STORAGE_DIR" 2>/dev/null || stat -c "%U" "$STORAGE_DIR" 2>/dev/null)
GROUP=$(stat -f "%Sg" "$STORAGE_DIR" 2>/dev/null || stat -c "%G" "$STORAGE_DIR" 2>/dev/null)

echo "Permissions: $PERMS"
echo "Owner: $OWNER"
echo "Group: $GROUP"

echo ""
echo "✍️  Write Test:"
echo "----------------------------------------"

# Test write permission
TEST_FILE="$STORAGE_DIR/.write_test_$$"
if touch "$TEST_FILE" 2>/dev/null; then
  echo "✅ Can write to storage directory"
  rm -f "$TEST_FILE"
else
  echo "❌ CANNOT write to storage directory!"
  echo ""
  echo "Fix with:"
  echo "  chmod 755 $STORAGE_DIR"
  echo "  # Or if running in Docker:"
  echo "  docker exec -it dan_data_node chmod 755 /app/storage"
  exit 1
fi

echo ""
echo "📁 Test Create Folder:"
echo "----------------------------------------"

TEST_FOLDER="$STORAGE_DIR/test_folder_$$"
if mkdir "$TEST_FOLDER" 2>/dev/null; then
  echo "✅ Can create folder in storage directory"
  rmdir "$TEST_FOLDER"
else
  echo "❌ CANNOT create folder in storage directory!"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ ALL CHECKS PASSED!"
echo "=========================================="
echo ""
echo "Storage directory is ready to use."
echo ""

