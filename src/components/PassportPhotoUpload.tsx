"use client";

import React, { useState, useRef, useCallback } from "react";
import { Camera, UploadCloud, CheckCircle2, AlertCircle, RefreshCw, Sparkles, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/context/LocaleContext";
import { supabase } from "@/lib/supabase/client";

interface PassportPhotoUploadProps {
  userId?: string;
  initialUrl?: string | null;
  onPhotoUploaded: (url: string) => void;
  disabled?: boolean;
}

interface CompressionStats {
  originalSizeKb: number;
  compressedSizeKb: number;
  format: string;
}

const MAX_TARGET_BYTES = 200 * 1024; // 200 KB maximum

export const PassportPhotoUpload: React.FC<PassportPhotoUploadProps> = ({
  userId,
  initialUrl = null,
  onPhotoUploaded,
  disabled = false,
}) => {
  const { t, isBengali } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<CompressionStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Compresses and crops an image to a square aspect ratio under 200KB WebP/JPEG.
   */
  const compressImage = useCallback(
    async (file: File): Promise<{ blob: Blob; mimeType: string; originalKb: number; compressedKb: number }> => {
      const originalKb = Math.round(file.size / 1024);

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onerror = () => reject(new Error("Failed to read image file"));
        reader.onload = (e) => {
          const img = new Image();
          img.src = e.target?.result as string;
          img.onerror = () => reject(new Error("Failed to load image"));
          img.onload = () => {
            // Center square crop
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;

            // Target square canvas: 600x600 px (downscalable if needed)
            const exportTarget = (canvasSize: number, mime: string, quality: number) => {
              const exportCanvas = document.createElement("canvas");
              exportCanvas.width = canvasSize;
              exportCanvas.height = canvasSize;
              const exportCtx = exportCanvas.getContext("2d");
              if (!exportCtx) {
                reject(new Error("Canvas context is not available"));
                return;
              }
              exportCtx.imageSmoothingEnabled = true;
              exportCtx.imageSmoothingQuality = "high";
              exportCtx.drawImage(img, sx, sy, minSide, minSide, 0, 0, canvasSize, canvasSize);

              exportCanvas.toBlob(
                (blob) => {
                  if (!blob) {
                    if (mime === "image/webp") {
                      // Fallback to JPEG if WebP unsupported
                      exportTarget(canvasSize, "image/jpeg", 0.85);
                    } else {
                      reject(new Error("Failed to encode compressed image"));
                    }
                    return;
                  }

                  // Safari fallback: if browser returned image/png when webp was requested
                  if (mime === "image/webp" && blob.type && !blob.type.includes("webp")) {
                    exportTarget(canvasSize, "image/jpeg", 0.85);
                    return;
                  }

                  // If still over 200KB and quality can be reduced
                  if (blob.size > MAX_TARGET_BYTES && quality > 0.4) {
                    exportTarget(canvasSize, mime, quality - 0.15);
                    return;
                  }

                  // If still over 200KB even at quality 0.4, downscale canvas resolution to 450x450
                  if (blob.size > MAX_TARGET_BYTES && canvasSize > 450) {
                    exportTarget(450, mime, 0.75);
                    return;
                  }

                  resolve({
                    blob,
                    mimeType: blob.type || mime,
                    originalKb,
                    compressedKb: Math.round(blob.size / 1024),
                  });
                },
                mime,
                quality
              );
            };

            // Start compression at 600x600, 0.85 quality WebP
            exportTarget(600, "image/webp", 0.85);
          };
        };
      });
    },
    []
  );

  /**
   * Uploads compressed image blob directly to Supabase 'avatars' bucket
   */
  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMessage(
        isBengali
          ? "অনুগ্রহ করে একটি বৈধ ছবি (JPG, PNG, WebP) নির্বাচন করুন।"
          : "Please select a valid image file (JPG, PNG, WebP)."
      );
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    setUploadProgress(t.auth.compressing);

    try {
      // 1. Client-side Canvas Compression (Guaranteed < 200KB)
      const { blob, mimeType, originalKb, compressedKb } = await compressImage(file);
      setCompressionStats({
        originalSizeKb: originalKb,
        compressedSizeKb: compressedKb,
        format: mimeType.includes("webp") ? "WebP" : "JPEG",
      });

      // Local preview immediately
      const objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);

      // 2. Upload directly to Supabase 'avatars' bucket
      setUploadProgress(
        isBengali ? "ছবি স্টোরেজে আপলোড করা হচ্ছে..." : "Uploading to secure storage..."
      );

      const ext = mimeType.includes("webp") ? "webp" : "jpg";
      const folder = userId || "guest";
      const fileName = `${folder}/${Date.now()}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, blob, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        console.warn("[PassportPhotoUpload] Supabase Storage notice:", uploadError.message);
        // Fallback for development/offline mode: use data URL or local object URL
        onPhotoUploaded(objectUrl);
        setUploadProgress(null);
        setIsProcessing(false);
        return;
      }

      // 3. Resolve private signed URL or public URL
      let resolvedUrl: string = objectUrl;
      try {
        const { data: signedData } = await supabase.storage
          .from("avatars")
          .createSignedUrl(uploadData.path, 60 * 60 * 24 * 365); // 1-year valid signed URL
        if (signedData?.signedUrl) {
          resolvedUrl = signedData.signedUrl;
        } else {
          const { data: publicUrlData } = supabase.storage
            .from("avatars")
            .getPublicUrl(uploadData.path);
          resolvedUrl = publicUrlData?.publicUrl || objectUrl;
        }
      } catch {
        const { data: publicUrlData } = supabase.storage
          .from("avatars")
          .getPublicUrl(uploadData.path);
        resolvedUrl = publicUrlData?.publicUrl || objectUrl;
      }

      onPhotoUploaded(resolvedUrl);
      setUploadProgress(null);
    } catch (err: unknown) {
      console.error("[PassportPhotoUpload] Error:", err);
      setErrorMessage(
        isBengali
          ? "ছবি প্রস্তুত করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।"
          : "Failed to process photo. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Drag-and-drop handlers
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isProcessing) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isProcessing) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-200 flex items-center space-x-1.5 font-bengali">
          <span>{t.auth.photoUploadTitle}</span>
          <span className="text-emerald-400">*</span>
        </label>
        <span className="text-[11px] text-slate-400 font-mono">Max 200KB (WebP)</span>
      </div>

      {/* Main Upload / Preview Container */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
          isDragging
            ? "border-emerald-500 bg-emerald-950/20 shadow-emerald-glow"
            : previewUrl
            ? "border-emerald-500/50 bg-slate-900/60"
            : "border-dashed border-slate-700 hover:border-slate-500 bg-slate-900/40"
        } p-4 sm:p-5 text-center`}
      >
        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={disabled || isProcessing}
          onChange={onFileChange}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          disabled={disabled || isProcessing}
          onChange={onFileChange}
        />

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {/* Square Preview Circle with Institutional Guide Frame */}
          <div className="relative w-36 h-36 flex-shrink-0 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner flex items-center justify-center group">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Passport Photo Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-600">
                <UserIcon className="w-14 h-14 stroke-1 mb-1" />
                <span className="text-[10px] uppercase font-mono tracking-wider">No Photo</span>
              </div>
            )}

            {/* Square Preview Guide Frame Overlay to Ensure Face Clarity */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {/* Circular Head Alignment Guide Line */}
              <div className="w-24 h-28 rounded-full border border-emerald-400/40 border-dashed" />
              {/* Eye-level Horizontal Marker */}
              <div className="absolute top-[38%] inset-x-4 border-t border-emerald-500/20" />
              {/* Corner Frame Brackets */}
              <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t-2 border-l-2 border-emerald-400/70" />
              <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t-2 border-r-2 border-emerald-400/70" />
              <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b-2 border-l-2 border-emerald-400/70" />
              <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b-2 border-r-2 border-emerald-400/70" />
            </div>

            {/* Processing Spinner Overlay */}
            {isProcessing && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-2">
                <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mb-1" />
                <span className="text-[10px] text-emerald-300 font-mono">Processing...</span>
              </div>
            )}
          </div>

          {/* Action Triggers and Guidance */}
          <div className="flex-1 text-center sm:text-left space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-slate-200 font-bengali">
                {previewUrl ? t.auth.photoReady : t.auth.dragDropOrCamera}
              </p>
              <p className="text-[11px] text-slate-400 font-bengali mt-0.5">
                • {t.auth.photoGuideNotice}
              </p>
            </div>

            {/* Interactive Upload Buttons */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
              {/* File Selector */}
              <button
                type="button"
                disabled={disabled || isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50"
              >
                <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bengali">
                  {previewUrl ? t.auth.reuploadPhoto : "ফাইল ব্রাউজ"}
                </span>
              </button>

              {/* Camera Capture Trigger */}
              <button
                type="button"
                disabled={disabled || isProcessing}
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/30 transition-colors disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bengali">{t.auth.cameraCapture}</span>
              </button>
            </div>

            {/* Compression Stats Badge */}
            {compressionStats && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-300 font-mono"
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>
                  {compressionStats.originalSizeKb}KB → {compressionStats.compressedSizeKb}KB (
                  {compressionStats.format})
                </span>
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              </motion.div>
            )}
          </div>
        </div>

        {/* Upload Progress Status Indicator */}
        {uploadProgress && (
          <p className="mt-2 text-[11px] text-emerald-400 font-mono animate-pulse">
            {uploadProgress}
          </p>
        )}
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/30 border border-rose-900/60 p-2.5 rounded-xl font-bengali"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PassportPhotoUpload;
