# Deploy OpenVSCode Server to NixOS

## Prerequisites

None

## Setup

1. Add the following lines to your `/etc/nixos/configuration.nix`:

```nix
virtualisation.oci-containers.containers = {
    openvscode-server = {
      image = "gitpod/openvscode-server:latest"; # choose between :latest or :nightly
      ports = ["3000:3000"];
      volumes = [
        "/srv:/home/workspace:cached" # change /srv as appropriate
      ];
    };
};
```

## Start the server

1. Apply the configuration changes via `$ nixos-rebuild switch`

## Access OpenVSCode Server

1. Open `http://ip-address:3000` in a new browser tab.

## Teardown

1. Remove the changes from `/etc/nixos/configuration.nix`
