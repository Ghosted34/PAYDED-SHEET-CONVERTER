import dotenv from "dotenv";
import express from 'express'
import path from 'path'
import cors from 'cors'
import helmet  from "helmet";
import morgan from "morgan";
import serveIndex from "serve-index";
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import healthRoutes from './health/health.routes.js'
import convertRoutes from './converter/converter.routes.js'
    
const __dirname = dirname(fileURLToPath(import.meta.url));


const app = express();

// Load env variables
dotenv.config();
console.log("Running in", process.env.NODE_ENV);

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://cdn.tailwindcss.com",
        "https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js",
        "'unsafe-eval'",   
        "'unsafe-inline'"
      ],
      scriptSrcAttr: ["'unsafe-inline'"], 
    },
  })
);
app.use(morgan('dev'));

// CORS appears before session middleware if cookies are used cross-origin
const corsOptions = {
  origin: [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "https://hicad.ng", // production
  ].filter(Boolean),
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};
app.use(cors(corsOptions));

// trust proxy when behind load balancer (set in env when needed)
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);

// built-in body parsers (remove body-parser dependency)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api", healthRoutes);
app.use("/api/convert", convertRoutes);


// static files and directory listing
app.use(express.static('./public'));
app.use("./public", serveIndex('/public', { icons: true }));


// centralized error handler
app.use((err, req, res, next) => {
  console.error(err.stack || err);
  res.status(500).json({ error: "Internal Server Error" });
});


export default app
