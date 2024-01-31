# luci-app-tailscale

Tailscale is a zero config VPN for building secure networks.

## How to build

- Only compatible with luci2 version

- Enter in your openwrt dir

  *1. replace the default startup script and configuration of Tailscale.*
  ```shell
  sed -i '/\/etc\/init\.d\/tailscale/d;/\/etc\/config\/tailscale/d;' feeds/packages/net/tailscale/Makefile
  ```

  *2. get luci-app-tailscale source & building*
  ```shell
  git clone https://github.com/asvow/luci-app-tailscale package/luci-app-tailscale
  make menuconfig # choose LUCI -> Applications -> luci-app-tailscale
  make package/luci-app-tailscale/compile V=s # luci-app-tailscale
  ```

--------------

## How to install prebuilt packages

- Upload the prebuilt ipk package to the /tmp directory of OpenWrt

- Login OpenWrt terminal (SSH)

  ```shell
  opkg update
  opkg install --force-overwrite /tmp/luci-app-tailscale_*_all.ipk
  ```

--------------

## Thanks
- [Carseason/openwrt-tailscale](https://github.com/Carseason/openwrt-tailscale)
- [immortalwrt/luci-app-zerotier](https://github.com/immortalwrt/luci/blob/master/applications/luci-app-zerotier)
