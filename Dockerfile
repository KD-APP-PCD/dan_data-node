FROM node:18-alpine

# Tạo thư mục làm việc
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Tạo thư mục storage
RUN mkdir -p storage

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

