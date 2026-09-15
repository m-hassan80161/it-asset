FROM node AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dist /app/dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
