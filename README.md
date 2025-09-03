# Collabo by codemintah

## A Powerful Real-time Collaborative Whiteboard Application

![Collabo Banner](public/favicon.ico)

Collabo is a powerful web-based collaborative whiteboard application that allows teams to work together in real-time. It provides an intuitive interface for drawing, sketching, and sharing ideas visually with team members from anywhere in the world.

## ✨ Features

- **Real-time collaboration** - See changes from teammates instantly
- **Multiple drawing tools** - Choose from various shapes, line widths, and colors
- **Selection and manipulation** - Move, resize, and edit elements on the board
- **Video chat** - Built-in WebRTC-based video conferencing
- **Background customization** - Change the canvas background to suit your needs
- **Image support** - Upload and manipulate images directly on the whiteboard
- **Canvas history** - Undo and redo actions as needed
- **Share and export** - Share your work or download as PNG
- **Mobile support** - Responsive design with touch gestures support

## 🚀 Getting Started

### Prerequisites

- Node.js 20.x
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone https://github.com/codemintah/collabo.git
cd collabo
```

2. Install dependencies:

```bash
npm install
# or
yarn
```

3. Start the development server:

```bash
npm run dev
# or
yarn dev
```

4. Open your browser and navigate to `http://localhost:3000`

### Building for Production

```bash
npm run build
npm run start
# or
yarn build
yarn start
```

### Deploying to Render

Collabo can be easily deployed to [Render](https://render.com) with WebSocket support.

1. **Fork or clone this repository**

2. **Create a new Web Service on Render**
   - Sign in to your Render account
   - Click "New +" and select "Web Service"
   - Connect your GitHub/GitLab account or provide the repository URL

3. **Configure the service**
   - **Name:** Choose a name for your service
   - **Environment:** Node
   - **Region:** Choose the region closest to your users
   - **Branch:** main (or your preferred branch)
   - **Build Command:** `chmod +x ./render-build.sh && ./render-build.sh`
   - **Start Command:** `npm run start:render`
   - **Instance Type:** Choose based on your needs (Starter is good for beginning)

4. **Add environment variables**
   - `NODE_ENV`: production
   - `PORT`: 3000
   - `NEXT_PUBLIC_APP_URL`: Your Render service URL (e.g., https://collabo-web.onrender.com)
   - `NEXT_PUBLIC_SOCKET_URL`: Same as your app URL (e.g., https://collabo-web.onrender.com)

5. **Enable WebSockets**
   - In your service settings, scroll down to "WebSockets"
   - Toggle "Enable WebSockets" to On

6. **Deploy**
   - Click "Create Web Service"
   - Render will automatically deploy your application

7. **Troubleshooting Deployment Issues**
   - If you see a "Cannot find module './render-config'" error, verify the import path in `server/index.ts` uses `"./render-config"` (not `"../server/render-config"`)
   - Check that you're using the Render-specific start command (`npm run start:render`) which correctly handles the working directory
   - If you encounter a CSS build error with `caniuse-lite` (`Cannot find module './features/cross-document-view-transitions'`), the deployment includes fixes for this:
     - Modified PostCSS configuration to remove autoprefixer dependency
     - Added a patching script to handle missing features
     - Used package overrides to lock caniuse-lite to a compatible version
   - Verify that all environment variables are set correctly in the Render dashboard
   - For other issues, check the detailed troubleshooting guide in `RENDER_DEPLOYMENT.md`

8. **Infrastructure as Code**
   - This project includes a `render.yaml` file for Infrastructure as Code deployment
   - You can use this file to create and configure your Render services automatically

For subsequent deployments, Render will automatically redeploy when you push changes to your repository.

### Render Deployment Checklist

1. Environment variables (in Render dashboard):
   - `NODE_ENV=production`
   - `PORT=3000`
   - `NEXT_PUBLIC_APP_URL=https://<your-service>.onrender.com`
   - `NEXT_PUBLIC_SOCKET_URL=https://<your-service>.onrender.com`

2. Commands (Service Settings):
   - Build: `chmod +x ./render-build.sh && ./render-build.sh`
   - Start: `npm run start:render`
   - WebSockets: enabled
   - Health check path: `/health`

3. Validate after deploy:
   - Browser: visit `https://<your-service>/health` (expects 200 JSON)
   - Polling: `curl -i "https://<your-service>/socket.io/?EIO=4&transport=polling"`
   - DevTools → Network → WS: confirm `transport=websocket` upgrades (101). If WS fails, polling requests should still return 200 (no 502).

4. If you see 502s or websocket errors:
   - Confirm env vars are set exactly to your service URL
   - Ensure the service is using the custom build script and `start:render`
   - Check logs for socket diagnostics (transport, upgrades, disconnect reasons)
   - Retry with client transports forced to polling to isolate upgrade issues

## 🛠️ Technologies Used

- **Next.js** - React framework for server-rendered applications
- **TypeScript** - Type-safe JavaScript
- **Socket.IO** - Real-time bidirectional event-based communication
- **WebRTC** - Real-time video communication
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Animation library
- **Recoil** - State management library

## 💡 Usage

1. Create a new room or join an existing one
2. Use the toolbar on the left to select your drawing tools
3. Invite others to join your room by sharing the URL
4. Collaborate in real-time with drawing and video chat

## 👨‍💻 About the Author

**Andrews Mintah (codemintah)** is a dedicated software developer proficient in Python, C++, JavaScript, and Java. Passionate about problem-solving and exploring new technologies.

- [GitHub](https://github.com/mintahandrews)
- [LinkedIn](https://www.linkedin.com/in/mintah-andrews/)
- [Instagram](https://www.instagram.com/mintah_andrews/)
- [TikTok](https://www.tiktok.com/@codemintah)
- [Portfolio](https://codemintah.netlify.app)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
