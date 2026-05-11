/**
 * FieldMediaUploader Component
 *
 * Purpose: Upload and manage field photos/videos for projects and work orders
 * using S3 presigned URLs for direct browser-to-S3 upload.
 *
 * Features:
 * - Photo and video file support only (validated client-side)
 * - S3 presigned URL upload flow (no server-side file handling)
 * - Upload progress tracking via XMLHttpRequest
 * - Thumbnail grid with play icon overlay for videos
 * - Delete functionality (uploader or admin only)
 * - Fetches existing media from GET /api/v1/vendor/media
 *
 * Upload Flow:
 * 1. User selects file(s)
 * 2. POST /api/v1/vendor/media/presign → get presigned URL + s3_key
 * 3. PUT directly to S3 using presigned URL (bypasses API server)
 * 4. POST /api/v1/vendor/media → create database record
 * 5. onUploadComplete callback fires with the created record
 */

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, X, Play, Trash2, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface FieldMedia {
  id: number;
  project_id: number | null;
  work_order_id: number | null;
  uploaded_by_user_id: number;
  media_type: "photo" | "video";
  s3_key: string;
  s3_bucket: string;
  filename: string;
  caption: string | null;
  uploaded_at: string;
  created_at: string;
  presigned_url?: string;
}

interface FieldMediaUploaderProps {
  projectId?: number;
  workOrderId?: number;
  onUploadComplete?: (media: FieldMedia) => void;
}

interface UploadingFile {
  id: string;
  filename: string;
  progress: number;
  error?: string;
}

export function FieldMediaUploader({
  projectId,
  workOrderId,
  onUploadComplete,
}: FieldMediaUploaderProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);

  const queryKey = projectId
    ? ["/api/v1/vendor/media", `project_id=${projectId}`]
    : ["/api/v1/vendor/media", `work_order_id=${workOrderId}`];

  const { data: mediaRecords, isLoading } = useQuery<{ field_media: FieldMedia[] }>({
    queryKey: queryKey,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/v1/vendor/media/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/vendor/media"] });
      toast({ title: "Media deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const canDelete = useCallback(
    (record: FieldMedia) => {
      return user?.role === "sponsor_admin" || record.uploaded_by_user_id === Number(user?.id);
    },
    [user]
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const uploadId = `${Date.now()}-${file.name}`;
      const isVideo = file.type.startsWith("video/");
      const mediaType = isVideo ? "video" : "photo";

      setUploadingFiles((prev) => [
        ...prev,
        { id: uploadId, filename: file.name, progress: 0 },
      ]);

      try {
        const { presigned_url, s3_key, s3_bucket } = await getPresignedUrl(
          file.name,
          mediaType,
          projectId,
          workOrderId
        );

        await uploadToS3WithProgress(
          presigned_url,
          file,
          (progress) => {
            setUploadingFiles((prev) =>
              prev.map((f) => (f.id === uploadId ? { ...f, progress } : f))
            );
          }
        );

        const record = await createMediaRecord({
          s3_key,
          s3_bucket,
          filename: file.name,
          media_type: mediaType,
          project_id: projectId,
          work_order_id: workOrderId,
        });

        setUploadingFiles((prev) => prev.filter((f) => f.id !== uploadId));
        onUploadComplete?.(record);

        return record;
      } catch (err) {
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === uploadId ? { ...f, error: String(err) } : f
          )
        );
        throw err;
      }
    },
    [projectId, workOrderId, onUploadComplete]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          toast({
            title: `Skipped ${file.name}`,
            description: "Only photos and videos are allowed",
            variant: "destructive",
          });
          continue;
        }

        uploadFile(file).catch((err) => {
          toast({
            title: `Upload failed: ${file.name}`,
            description: err.message,
            variant: "destructive",
          });
        });
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadFile, toast]
  );

  const handleRemoveUploading = (uploadId: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== uploadId));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Field Media</h3>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*"
            multiple
            onChange={handleFileSelect}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" />
            Upload
          </Button>
        </div>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((file) => (
            <div key={file.id} className="flex items-center gap-2">
              {file.error ? (
                <span className="text-xs text-destructive flex-1">{file.error}</span>
              ) : (
                <>
                  <span className="text-xs flex-1 truncate">{file.filename}</span>
                  <span className="text-xs text-muted-foreground">{file.progress}%</span>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleRemoveUploading(file.id)}
              >
                <X className="h-3 w-3" />
              </Button>
              {file.progress > 0 && file.progress < 100 && (
                <Progress value={file.progress} className="w-20" />
              )}
              {file.progress === 100 && <Loader2 className="h-4 w-4 animate-spin" />}
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading media...</div>
      ) : mediaRecords?.field_media && mediaRecords.field_media.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {mediaRecords.field_media.map((record) => (
            <MediaThumbnail
              key={record.id}
              record={record}
              canDelete={canDelete(record)}
              onDelete={() => deleteMutation.mutate(record.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg p-6 text-center">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No field media uploaded
        </div>
      )}
    </div>
  );
}

interface MediaThumbnailProps {
  record: FieldMedia;
  canDelete: boolean;
  onDelete: () => void;
}

function MediaThumbnail({ record, canDelete, onDelete }: MediaThumbnailProps) {
  const [showDelete, setShowDelete] = useState(false);

  const thumbnailUrl = record.presigned_url || record.s3_key;

  return (
    <div
      className="group relative aspect-video rounded-lg overflow-hidden bg-muted cursor-pointer"
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {record.media_type === "photo" ? (
        <img
          src={thumbnailUrl}
          alt={record.filename}
          className="h-full w-full object-cover"
        />
      ) : (
        <>
          <img
            src={thumbnailUrl}
            alt={record.filename}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Play className="h-8 w-8 text-white fill-white" />
          </div>
        </>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] p-1 truncate">
        {record.filename}
      </div>

      {canDelete && showDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-90 hover:opacity-100"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

async function getPresignedUrl(
  filename: string,
  mediaType: "photo" | "video",
  projectId?: number,
  workOrderId?: number
): Promise<{
  presigned_url: string;
  s3_key: string;
  s3_bucket: string;
  expires_in: number;
}> {
  const res = await apiRequest("POST", "/api/v1/vendor/media/presign", {
    filename,
    media_type: mediaType,
    project_id: projectId,
    work_order_id: workOrderId,
  });
  return res.json();
}

async function uploadToS3WithProgress(
  url: string,
  file: File,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.statusText}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("S3 upload failed"));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("S3 upload aborted"));
    });

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.send(file);
  });
}

async function createMediaRecord(data: {
  s3_key: string;
  s3_bucket: string;
  filename: string;
  media_type: "photo" | "video";
  project_id?: number;
  work_order_id?: number;
  caption?: string;
}): Promise<FieldMedia> {
  const res = await apiRequest("POST", "/api/v1/vendor/media", data);
  const result = await res.json();
  return result.field_media;
}