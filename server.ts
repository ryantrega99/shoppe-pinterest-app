import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  serverTimestamp, 
  query, 
  where,
  limit,
  Timestamp,
  setDoc
} from "firebase/firestore";
import axios from "axios";
import cron from "node-cron";

// Import config using standard ESM import
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

dotenv.config();

// Initialize Firebase Client SDK for server-side use
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Test Firestore connection
async function testFirestore() {
  try {
    console.log(`Testing Firestore connection to project: ${firebaseConfig.projectId}, database: ${firebaseConfig.firestoreDatabaseId}`);
    // Using a simple getDocs with limit to test connection
    const usersSnap = await getDocs(query(collection(db, "users"), limit(1)));
    console.log("Firestore connection test successful. Found users:", usersSnap.size);
  } catch (error: any) {
    console.error("Firestore connection test FAILED:", error.message);
  }
}
testFirestore();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes go here
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Pinterest OAuth Routes
  app.get("/api/auth/pinterest/url", (req, res) => {
    const clientId = process.env.PINTEREST_CLIENT_ID;
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    if (!appUrl) {
      console.error("APP_URL is missing in environment variables");
      return res.status(500).json({ error: "APP_URL tidak dikonfigurasi di Settings." });
    }
    const redirectUri = `${appUrl}/api/auth/pinterest/callback`;
    const state = req.query.uid as string;

    if (!clientId) {
      console.error("Pinterest Client ID is missing in environment variables");
      return res.status(500).json({ error: "Pinterest Client ID not configured" });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "boards:read,pins:read,pins:write",
      state: state
    });

    const url = `https://www.pinterest.com/oauth/?${params.toString()}`;
    console.log("Generated Pinterest Auth URL:", url);
    res.json({ url });
  });

  app.get("/api/auth/pinterest/callback", async (req, res) => {
    const { code, state: uid, error } = req.query;
    
    if (error) {
      console.error("Pinterest Auth Callback Error:", error);
      return res.status(400).send(`Pinterest Auth Error: ${error}`);
    }

    const clientId = process.env.PINTEREST_CLIENT_ID;
    const clientSecret = process.env.PINTEREST_CLIENT_SECRET;
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    if (!appUrl) {
      console.error("APP_URL is missing in environment variables");
      return res.status(500).send("APP_URL tidak dikonfigurasi di Settings.");
    }
    const redirectUri = `${appUrl}/api/auth/pinterest/callback`;

    if (!code || !uid) {
      console.error("Missing code or state in Pinterest callback", { code, uid });
      return res.status(400).send("Missing code or state");
    }

    try {
      console.log("Exchanging code for token with redirect_uri:", redirectUri);
      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const response = await axios.post("https://api.pinterest.com/v5/oauth/token", 
        new URLSearchParams({
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri
        }),
        {
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      // Store tokens in Firestore using Client SDK
      const tokenRef = doc(db, "users", uid as string, "private", "pinterest");
      await setDoc(tokenRef, {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + (expires_in * 1000),
        updatedAt: serverTimestamp()
      }, { merge: true });

      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f4f5;">
            <div style="background: white; padding: 2rem; border-radius: 1.5rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); text-align: center;">
              <h1 style="color: #10b981;">Berhasil!</h1>
              <p>Pinterest berhasil terhubung. Jendela ini akan tertutup otomatis.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'PINTEREST_AUTH_SUCCESS' }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              </script>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Pinterest OAuth Error:", error.response?.data || error.message);
      res.status(500).send("Gagal menghubungkan Pinterest. Silakan coba lagi.");
    }
  });

  // Background Worker for Scheduled Posts
  cron.schedule("* * * * *", async () => {
    console.log("Checking for scheduled posts...");
    const now = Timestamp.now();
    
    try {
      // Get all users using Client SDK
      const usersSnap = await getDocs(collection(db, "users"));
      
      if (usersSnap.empty) {
        console.log("No users found.");
        return;
      }

      for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        
        // Get Pinterest Token
        const tokenSnap = await getDoc(doc(db, "users", uid, "private", "pinterest"));
        if (!tokenSnap.exists()) continue;

        const { accessToken } = tokenSnap.data()!;

        // Query pending posts for this specific user
        const scheduledSnap = await getDocs(
          query(collection(db, "users", uid, "scheduledPosts"), where("status", "==", "pending"))
        );

        if (scheduledSnap.empty) continue;

        for (const postDoc of scheduledSnap.docs) {
          const post = postDoc.data();
          
          // Filter by scheduled time in memory
          if (post.scheduledAt && post.scheduledAt.toDate() > now.toDate()) {
            continue;
          }

          console.log(`Posting scheduled pin for user ${uid}: ${post.title}`);

          try {
            await axios.post("https://api.pinterest.com/v5/pins", {
              title: post.title,
              description: post.tags ? `${post.description}\n\nTags: ${post.tags}` : (post.description || ""),
              link: post.link,
              alt_text: post.title,
              media_source: {
                source_type: "image_url",
                url: post.imageUrl
              },
              board_id: post.boardId
            }, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
              }
            });

            await updateDoc(postDoc.ref, {
              status: "posted",
              updatedAt: serverTimestamp()
            });
            console.log(`Pin "${post.title}" posted successfully for user ${uid}`);
          } catch (error: any) {
            console.error(`Error posting pin for user ${uid}:`, error.response?.data || error.message);
            await updateDoc(postDoc.ref, {
              status: "failed",
              error: error.response?.data?.message || error.message,
              updatedAt: serverTimestamp()
            });
          }
        }
      }
    } catch (error) {
      console.error("Cron Job Error:", error instanceof Error ? error.message : String(error));
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
