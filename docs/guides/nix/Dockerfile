FROM gitpod/openvscode-server:latest

USER root

# Install Ubuntu packages
RUN apt-get update \
    && apt-get install -y curl xz-utils

# Install Nix
RUN addgroup --system nixbld \
  && adduser vscode-server nixbld \
  && for i in $(seq 1 30); do useradd -ms /bin/bash nixbld$i &&  adduser nixbld$i nixbld; done \
  && mkdir -m 0755 /nix && chown vscode-server /nix \
  && mkdir -p /etc/nix && echo 'sandbox = false' > /etc/nix/nix.conf

# Install Nix
CMD /bin/bash -l
USER vscode-server
ENV USER vscode-server
WORKDIR /home/workspace

RUN touch .bash_profile \
 && curl https://nixos.org/releases/nix/nix-2.3.15/install | sh

RUN echo '. /home/workspace/.nix-profile/etc/profile.d/nix.sh' >> /home/workspace/.bashrc
RUN mkdir -p /home/workspace/.config/nixpkgs && echo '{ allowUnfree = true; }' >> /home/workspace/.config/nixpkgs/config.nix

# Install cachix
RUN . /home/workspace/.nix-profile/etc/profile.d/nix.sh \
  && nix-env -iA cachix -f https://cachix.org/api/v1/install \
  && cachix use cachix

# Install git
RUN . /home/workspace/.nix-profile/etc/profile.d/nix.sh \
  && nix-env -i git git-lfs

# Install direnv
RUN . /home/workspace/.nix-profile/etc/profile.d/nix.sh \
  && nix-env -i direnv \
  && direnv hook bash >> /home/workspace/.bashrc
