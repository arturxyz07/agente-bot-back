import { Router, ErrorRequestHandler } from "express";
import mongoose, { Schema } from "mongoose";
import multer from "multer";
import { authMiddleware } from "./authMiddleware";
import { adminMiddleware } from "./adminMiddleware";
import { answerFromDocument, DocumentError, extractDocumentText, MAX_DOCUMENT_BYTES, MAX_QUESTION_CHARS } from "./rag";

export const KnowledgeDocument = mongoose.model("KnowledgeDocument", new Schema({
  name: { type: String, required: true },
  text: { type: String, required: true, select: false },
  bytes: { type: Number, required: true },
  characters: { type: Number, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true }));

export const adminRoutes = Router();
adminRoutes.use(authMiddleware, adminMiddleware);
adminRoutes.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 0 } });

adminRoutes.get("/documents", async (_req, res) => {
  try {
    const documents = await KnowledgeDocument.find().select("name bytes characters createdAt").sort({ createdAt: -1 });
    res.json({ documents });
  } catch {
    res.status(503).json({ error: "Não foi possível listar os documentos." });
  }
});

adminRoutes.post("/documents", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) { res.status(400).json({ error: "Envie o documento no campo file." }); return; }
    const text = await extractDocumentText(req.file.buffer, req.file.originalname);
    const name = req.file.originalname.replace(/[\\/]/g, "_").slice(0, 200);
    const doc = await KnowledgeDocument.create({ name, text, bytes: req.file.size, characters: text.length, uploadedBy: req.userId });
    res.status(201).json({ document: { _id: doc._id, name: doc.name, bytes: doc.bytes, characters: doc.characters, createdAt: doc.createdAt } });
  } catch (error) {
    res.status(error instanceof DocumentError ? 400 : 500).json({ error: error instanceof DocumentError ? error.message : "Não foi possível salvar o documento." });
  }
});

adminRoutes.param("id", (_req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) { res.status(400).json({ error: "Identificador de documento inválido." }); return; }
  next();
});

adminRoutes.delete("/documents/:id", async (req, res) => {
  try {
    const doc = await KnowledgeDocument.findByIdAndDelete(req.params.id);
    if (!doc) { res.status(404).json({ error: "Documento não encontrado." }); return; }
    res.json({ deleted: true });
  } catch {
    res.status(503).json({ error: "Não foi possível excluir o documento." });
  }
});

adminRoutes.post("/documents/:id/ask", async (req, res) => {
  const question = req.body?.question;
  if (typeof question !== "string" || !question.trim() || question.length > MAX_QUESTION_CHARS) {
    res.status(400).json({ error: "Informe uma pergunta de até 4.000 caracteres." }); return;
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    res.status(503).json({ error: "Configure GOOGLE_GENERATIVE_AI_API_KEY no backend." }); return;
  }
  try {
    const doc = await KnowledgeDocument.findById(req.params.id).select("+text");
    if (!doc) { res.status(404).json({ error: "Documento não encontrado." }); return; }
    const answer = await answerFromDocument(doc.text, question.trim());
    res.json({ answer, document: { _id: doc._id, name: doc.name } });
  } catch {
    res.status(502).json({ error: "Não foi possível consultar o documento. Verifique a conexão e a configuração do Gemini e tente novamente." });
  }
});

const uploadError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "O arquivo deve ter até 4 MiB." : "Envie um único arquivo no campo file, sem campos adicionais." });
    return;
  }
  res.status(400).json({ error: "Upload inválido. Envie um formulário multipart com um arquivo PDF ou TXT." });
};
adminRoutes.use(uploadError);
