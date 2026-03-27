
import React, { useCallback, useState } from 'react';
import LoadingSpinner from './LoadingSpinner';
import { uploadArticleImage } from '../services/uploadHandler';

interface FeaturedImageUploaderProps {
  heroImageUrl: string;
  onImageUpload: (file: File) => void;
  onImageRemove: () => void;
  isLoading: boolean;
  articleId?: string; // Optional: for organizing uploads by article
}

const FeaturedImageUploader: React.FC<FeaturedImageUploaderProps> = ({
  heroImageUrl,
  onImageUpload,
  onImageRemove,
  isLoading,
  articleId = 'draft' // Default to 'draft' if no article ID provided
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Validate file before upload
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file (PNG, JPG, WEBP)');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum size is 10MB');
        return;
      }

      // Call the parent's onImageUpload which will handle the actual upload
      onImageUpload(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];

      // Validate file before upload
      if (!file.type.startsWith('image/')) {
        alert('Please drop an image file (PNG, JPG, WEBP)');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert('File too large. Maximum size is 10MB');
        return;
      }

      onImageUpload(file);
    }
  }, [onImageUpload]);

  const handleDragEvents = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-center">
          <LoadingSpinner />
          <p className="mt-2 text-sm text-text-secondary animate-pulse">
            Uploading to Hostinger...
          </p>
          {uploadProgress && (
            <p className="mt-1 text-xs text-accent">{uploadProgress}</p>
          )}
        </div>
      );
    }

    if (heroImageUrl) {
      return (
        <div className="p-4 h-full flex flex-col items-center justify-center text-center">
          <img
            src={heroImageUrl}
            alt="Featured image preview"
            className="max-h-32 w-auto object-contain rounded-lg mb-4 shadow-lg"
            onError={(e) => {
              console.error('Image failed to load:', heroImageUrl);
              e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImage Error%3C/text%3E%3C/svg%3E';
            }}
          />
          <div className="flex gap-2">
            <label htmlFor="image-upload-change" className="cursor-pointer cta-button text-sm !bg-accent hover:!bg-cyan-500">
              Change
            </label>
            <input
              type="file"
              id="image-upload-change"
              name="image-upload-change"
              className="hidden"
              accept="image/png, image/jpeg, image/webp"
              onChange={handleFileChange}
            />
            <button onClick={onImageRemove} className="secondary-button text-sm">
              Remove
            </button>
          </div>
          {heroImageUrl.includes('/api/uploads/') && (
            <p className="mt-2 text-xs text-green-500">✓ Stored on Hostinger</p>
          )}
        </div>
      );
    }

    return (
      <label
        htmlFor="image-upload-initial"
        className={`relative w-full h-full flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 group ${isDragging ? 'border-accent bg-accent/10' : 'border-border-color bg-background/50 hover:border-accent/50'}`}
      >
        <div className={`absolute inset-0 rounded-xl transition-all duration-300 ${isDragging ? 'shadow-[0_0_20px] shadow-accent/50' : ''}`}></div>
        <svg className={`w-12 h-12 mx-auto text-text-secondary group-hover:text-accent/80 transition-colors ${isDragging ? 'text-accent' : ''}`} stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="mt-2 text-sm text-text-secondary"><span className="font-semibold text-accent">Click to upload</span> or drag and drop</p>
        <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 10MB</p>
        <p className="text-xs text-accent mt-1">Uploads to your Hostinger server</p>
        <input
          type="file"
          id="image-upload-initial"
          name="image-upload-initial"
          className="hidden"
          accept="image/png, image/jpeg, image/webp"
          onChange={handleFileChange}
        />
      </label>
    );
  };

  return (
    <div
      className="p-6 bg-card-bg rounded-xl shadow-2xl border border-border-color"
      onDrop={handleDrop}
      onDragEnter={handleDragEvents}
      onDragOver={handleDragEvents}
      onDragLeave={handleDragEvents}
    >
      <h2 className="text-xl font-bold font-heading text-text-headings mb-3 border-b border-border-color pb-3">Featured Image</h2>
      <div className="h-48">
        {renderContent()}
      </div>
    </div>
  );
};

export default FeaturedImageUploader;