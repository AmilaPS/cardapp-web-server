FROM node:18

# FFmpeg, Python3, Pip සහ python-is-python3 (Command Alias Fix) Install කිරීම
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Python Dependencies අවශ්‍ය නම් Install කිරීම
RUN if [ -f requirements.txt ]; then pip3 install --no-cache-dir --break-system-packages -r requirements.txt; fi

EXPOSE 8080

CMD ["node", "server.js"]
