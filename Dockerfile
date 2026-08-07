FROM node:18

# System packages: FFmpeg, Python3, Pip සහ python-is-python3 (Command Alias Fix) Install කිරීම
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

# Video Processing සඳහා අවශ්‍ය ප්‍රධාන Python Libraries Install කිරීම
RUN pip3 install --no-cache-dir --break-system-packages pillow moviepy opencv-python-headless requests numpy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080

CMD ["node", "server.js"]
