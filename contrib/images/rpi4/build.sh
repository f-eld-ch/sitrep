#!/bin/bash

set -euf -o pipefail

echo "Generating Ignotion config from config.yaml"
butane config.yaml > config.ign


echo "Generating Raw Image"
RAW_IMAGE=sitrep-rpi4.raw
dd if=/dev/zero of=$RAW_IMAGE bs=1024k seek=8192 count=0

# setup the loop device from the raw disk
FCOSDISK=$(sudo losetup -P -f --show $RAW_IMAGE)

echo "Installing coreos to raw image"
STREAM="stable"
sudo coreos-installer install -a aarch64 -s $STREAM -i config.ign --append-karg nomodeset $FCOSDISK --preserve-on-error && sleep 3

echo "Installing EDK2 to EFI for Raspberry Pi 4"
# Install EDK2 firmware to EFI
VERSION=v1.37  # use latest one from https://github.com/pftf/RPi4/releases
FCOSEFIPARTITION=`lsblk ${FCOSDISK} -J -oLABEL,PATH  | jq -r '.blockdevices[] | select(.label == "EFI-SYSTEM")'.path`
TMP_DIR=`mktemp -d`
sudo mount ${FCOSEFIPARTITION} $TMP_DIR
pushd $TMP_DIR
sudo curl -LO https://github.com/pftf/RPi4/releases/download/${VERSION}/RPi4_UEFI_Firmware_${VERSION}.zip
sudo unzip RPi4_UEFI_Firmware_${VERSION}.zip
sudo rm RPi4_UEFI_Firmware_${VERSION}.zip
popd
sudo umount $TMP_DIR || true

echo "Compressing image"
xz -v --threads=0 $RAW_IMAGE 

# deletes the temp directory
function cleanup {
  [ -d "$TMP_DIR" ] && rm -rf $TMP_DIR
  [ -f "$FCOSDISK" ] && sudo losetup -d ${FCOSDISK##*/}
}

# register the cleanup function to be called on the EXIT signal
trap cleanup EXIT
