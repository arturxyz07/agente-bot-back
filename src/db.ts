import mongoose, { Schema, Document, Types } from "mongoose";

// ─── User ────────────────────────────────────────────────────────────────────

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  xp: number;
  level: number;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model<IUser>("User", UserSchema);

// ─── Message ─────────────────────────────────────────────────────────────────

export interface IMessageImage {
  url: string;
  publicId: string;
  mimeType: string;

  width?: number;
  height?: number;
  bytes?: number;
}

export interface IMessage {
  role: "user" | "assistant";
  content: string;
  images?: IMessageImage[];
  createdAt: Date;
}

const MessageImageSchema = new Schema<IMessageImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    mimeType: { type: String, required: true },
    width: Number,
    height: Number,
    bytes: Number,
  },
  { _id: false }
);

const MessageSchema = new Schema<IMessage>({
  role: {
    type: String,
    enum: ["user", "assistant"],
    required: true,
  },

  content: {
    type: String,
    default: "",
  },

  images: {
    type: [MessageImageSchema],
    default: [],
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ─── Conversation ─────────────────────────────────────────────────────────────

export interface IConversation extends Document {
  userId: Types.ObjectId;
  modelId: string;
  title: string;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    modelId: { type: String, required: true },
    title: { type: String, default: "Nova conversa" },
    messages: [MessageSchema],
  },
  { timestamps: true }
);

export const Conversation = mongoose.model<IConversation>("Conversation", ConversationSchema);

// ─── Connect ──────────────────────────────────────────────────────────────────

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn("⚠️  MONGO_URI não definida — banco de dados desabilitado.");
    return;
  }
  try {
    await mongoose.connect(uri);
    console.log("📦 Conectado ao MongoDB Atlas!");
  } catch (err) {
    console.error("❌ Erro ao conectar ao banco:", err);
    process.exit(1);
  }
}
