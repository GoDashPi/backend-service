FROM jrottenberg/ffmpeg

RUN apt-get update && \
    apt-get -y install python python-pip wget

RUN pip install --upgrade pip

RUN pip install --upgrade awscli

ENV NVM_DIR /usr/local/nvm
ENV NODE_VERSION v6.10.0

RUN /bin/bash -c 'wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.0/install.sh | bash \
  && source $NVM_DIR/nvm.sh \
  && nvm install $NODE_VERSION'

ENV NODE_PATH $NVM_DIR/versions/node/$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/$NODE_VERSION/bin:$PATH
