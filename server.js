const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Variáveis globais que serão injetadas no HTML
const VARS = {
    GAL_ANGLE: 60,
};

const root = process.cwd();
const PORT = 8080;

const requestHandler = (req, res) => {
    const protocol = req.socket.encrypted ? "https" : "http";
    const url = new URL(req.url, `${protocol}://localhost`);
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    if (requested === "/favicon.ico") {
        res.writeHead(302, { Location: "/assets/icon-192.png" });
        return res.end();
    }
    const file = path.join(root, requested);

    fs.stat(file, (err, stats) => {
        if (err || !stats.isFile()) {
            console.log("404:", requested);
            res.writeHead(404);
            return res.end("Not found");
        }

        let contentType = "application/octet-stream";
        let isHtml = file.endsWith(".html");

        if (isHtml) contentType = "text/html; charset=utf-8";
        else if (file.endsWith(".js")) contentType = "application/javascript";
        else if (file.endsWith(".css")) contentType = "text/css";
        else if (file.endsWith(".json")) contentType = "application/json";
        else if (file.endsWith(".png")) contentType = "image/png";
        else if (file.endsWith(".jpg") || file.endsWith(".jpeg")) contentType = "image/jpeg";
        else if (file.endsWith(".webp")) contentType = "image/webp";
        else if (file.endsWith(".webm")) contentType = "video/webm";
        else if (file.endsWith(".mp4")) contentType = "video/mp4";
        else if (file.endsWith(".svg")) contentType = "image/svg+xml";
        else if (file.endsWith(".glb")) contentType = "model/gltf-binary";
        else if (file.endsWith(".gltf")) contentType = "model/gltf+json";
        else if (file.endsWith(".mp3")) contentType = "audio/mpeg";
        else if (file.endsWith(".m4a")) contentType = "audio/mp4";

        // Se for arquivo HTML, faz a substituição do {{variavel}}
        if (isHtml) {
            fs.readFile(file, "utf-8", (err, data) => {
                if (err) {
                    res.writeHead(500);
                    return res.end();
                }
                let htmlContent = data.replace(/{{\s*([\w_]+)\s*}}/g, (match, key) => {
                    return key in VARS ? VARS[key] : match;
                });
                res.writeHead(200, { "Content-Type": contentType });
                res.end(htmlContent);
            });
            return;
        }

        // Suporte a Range requests (HTTP 206) essencial para streaming de vídeo sem engasgos
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
            const chunksize = (end - start) + 1;
            const fileStream = fs.createReadStream(file, { start, end });
            res.writeHead(206, {
                "Content-Range": `bytes ${start}-${end}/${stats.size}`,
                "Accept-Ranges": "bytes",
                "Content-Length": chunksize,
                "Content-Type": contentType
            });
            fileStream.pipe(res);
        } else {
            res.writeHead(200, {
                "Content-Length": stats.size,
                "Content-Type": contentType,
                "Accept-Ranges": "bytes"
            });
            fs.createReadStream(file).pipe(res);
        }
    });
};

const certFile = path.join(root, "cert", "dev.pem");
const keyFile = path.join(root, "cert", "dev-key.pem");
const forceHttp = process.argv.includes("--http");
const hasCerts = fs.existsSync(certFile) && fs.existsSync(keyFile);

let server;
let protocol = "https";

if (forceHttp) {
    server = http.createServer(requestHandler);
    protocol = "http";
} else if (hasCerts) {
    try {
        const options = {
            key: fs.readFileSync(keyFile),
            cert: fs.readFileSync(certFile)
        };
        server = https.createServer(options, requestHandler);
        protocol = "https";
    } catch (e) {
        console.warn(`[AVISO] Falha ao ler certificados em cert/: ${e.message}`);
        console.log("Iniciando em modo HTTP simples...");
        server = http.createServer(requestHandler);
        protocol = "http";
    }
} else {
    console.log(`[INFO] Certificados não encontrados em cert/.`);
    console.log(`Para modo HTTPS (Wi-Fi), execute antes: ./gencert.sh`);
    console.log(`Iniciando em modo HTTP simples (ideal para cabo USB / adb reverse)...`);
    server = http.createServer(requestHandler);
    protocol = "http";
}

server.listen(PORT, "::", () => {
    if (protocol === "https") {
        console.log(`\nServidor HTTPS rodando! (Modo de Desenvolvimento Wi-Fi / Hotspot)`);
        console.log(`  Local:            https://localhost:${PORT}`);
        const hostname = os.hostname().replace(/\.local$/i, "");
        console.log(`  Nome fixo (mDNS): https://${hostname}.local:${PORT}`);
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
                if (net.family === familyV4Value && !net.internal) {
                    console.log(`  Na rede (${name}): https://${net.address}:${PORT}`);
                }
            }
        }
        console.log(`\n(Dica: Para modo cabo USB sem certificados, use: node server.js --http)`);
    } else {
        console.log(`\nServidor HTTP rodando! (Modo de Deploy Local com Cabo / adb)`);
        console.log(`  Local (Meta Quest via adb reverse): http://localhost:${PORT}`);
        console.log(`\n(Dica: Para modo Wi-Fi com HTTPS, gere as chaves com ./gencert.sh e execute: node server.js)`);
    }
});