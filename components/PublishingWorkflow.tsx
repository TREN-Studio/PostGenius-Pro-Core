
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { BlogPostData, WordPressConfig, PublishingProgress, ArticleStatus } from '../types';
import { PublishingStatus } from '../types';
import LoadingSpinner from './LoadingSpinner';

const PUBLISHING_WORKFLOW_CHUNK_VERSION = '20260309c';

interface PublishingWorkflowProps {
  data: BlogPostData;
  wpConfig: WordPressConfig;
  onPublish: (status: ArticleStatus) => void;
  publishingStatus: PublishingStatus;
  publishingProgress: PublishingProgress;
  publishError: string | null;
  newPostLink: string | null;
  newPostId: number | null;
  sourceUrl?: string;
  userRole: 'admin' | 'user';
  articleStatus: ArticleStatus | null;
  onSubmitForReview: () => void;
  isSubmitting: boolean;
  submitStatus: string;
  finalHtml: string;
  onReset: () => void;
  heroImageUrl: string;
  onRegenerateImage: (imageKey: string) => void;
  isLoadingHeroImage: boolean;
}

const CopyButton: React.FC<{ textToCopy: string }> = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`ml-2 px-2 py-1 text-xs rounded transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-text-primary'}`}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
};

const PublishingWorkflow: React.FC<PublishingWorkflowProps> = (props) => {
  const {
    data, wpConfig, onPublish, publishingStatus, publishingProgress, publishError,
    newPostLink, newPostId, sourceUrl, userRole, articleStatus,
    onSubmitForReview, isSubmitting, submitStatus, finalHtml, onReset,
    heroImageUrl, onRegenerateImage, isLoadingHeroImage
  } = props;

  const canPublishToWp = useMemo(() => !!(wpConfig.url && wpConfig.username && wpConfig.password), [wpConfig]);
  const allTags = useMemo(() => [...data.tags.course, ...data.tags.cuisine, ...data.tags.keywords].join(', '), [data.tags]);

  const handleDownload = () => { /* ... download logic ... */ };

  const renderPublishingStep = () => {
    switch (publishingStatus) {
      case PublishingStatus.Publishing: {
        const { message, logs, current, total } = publishingProgress;
        const progressPercent = (total && typeof current !== 'undefined') ? Math.round((current / total) * 100) : 0;

        return (
          <div className="flex flex-col space-y-4 p-6 bg-blue-900/30 rounded-lg border border-blue-500/50">
            <div className="text-center">
              <h4 className="font-bold text-lg text-blue-200">{message}</h4>
              {typeof total !== 'undefined' && <p className="text-sm text-blue-300">{`(${current} of ${total} tasks complete)`}</p>}
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
              <div className="bg-accent h-2.5 rounded-full" style={{ width: `${progressPercent}%`, transition: 'width 0.5s ease-in-out' }}></div>
            </div>
            <div className="mt-4 p-3 bg-background/50 rounded-md max-h-48 overflow-y-auto text-xs text-text-secondary font-mono border border-border-color">
              {logs && logs.slice().reverse().map((log, index) => <p key={index} className="whitespace-pre-wrap border-b border-border-color py-1">{log}</p>)}
            </div>
          </div>
        );
      }
      case PublishingStatus.Success: {
        const editLink = newPostId && wpConfig.url ? `${wpConfig.url.replace(/\/$/, '')}/wp-admin/post.php?post=${newPostId}&action=edit` : null;
        const isInternalLink = newPostLink && newPostLink.startsWith('/');

        return (
          <div className="p-6 bg-green-900/40 border border-green-500 text-green-200 rounded-lg text-center">
            <h4 className="font-bold text-xl mb-2">✅ Success!</h4>
            <p className="mb-4">
              {isInternalLink
                ? "Your post has been published live to the Postgenius Pro blog."
                : "Your post has been created as a draft in WordPress."
              }
            </p>

            <div className="flex flex-col gap-3">
              {newPostLink && (
                isInternalLink ? (
                  <Link to={newPostLink} target="_blank" className="w-full inline-block px-5 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 transition-all">
                    View Live Post
                  </Link>
                ) : (
                  <a href={editLink || newPostLink} target="_blank" rel="noopener noreferrer" className="w-full inline-block px-5 py-3 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 transition-all">
                    Edit Draft in WordPress
                  </a>
                )
              )}

              {/* Internal Blog Link for easy access */}
              {!isInternalLink && (
                <Link to="/blog" target="_blank" className="w-full inline-block px-5 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 transition-all">
                  View on Postgenius Blog
                </Link>
              )}

              {/* Republish / Reset Button */}
              <button
                onClick={onReset}
                className="w-full inline-block px-5 py-3 bg-gray-700 text-white font-bold rounded-lg shadow-md hover:bg-gray-600 transition-all"
              >
                Continue Editing / Republish
              </button>
            </div>
          </div>
        );
      }
      case PublishingStatus.Error: {
        return (
          <div className="p-6 bg-red-900/50 border border-red-500 text-red-200 rounded-lg">
            <h4 className="font-bold text-lg mb-2">Publishing Failed</h4>
            <p className="text-sm whitespace-pre-wrap">{publishError}</p>
            <button onClick={() => onPublish('Published to WP Draft')} className="mt-4 w-full cta-button">Retry Publishing</button>
          </div>
        );
      }
      default: // Idle
        // ... (default buttons for Publish etc.)
        return (
          <div className="p-4 border border-border-color rounded-lg bg-background/50">
            <h3 className="font-bold text-lg mb-3 text-accent">Final Actions</h3>
            {userRole === 'admin' ? (
              <div className="flex flex-col gap-4">
                <button onClick={() => onPublish('Published')} className="w-full cta-button">Publish Live to Postgenius Pro</button>
                {canPublishToWp ? (
                  <button onClick={() => onPublish('Published to WP Draft')} className="w-full secondary-button">Save as Draft in WordPress</button>
                ) : (
                  <div className="w-full text-center p-3 bg-background/70 rounded-md text-sm text-text-secondary">WordPress Publishing Disabled</div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <button onClick={onSubmitForReview} className="w-full cta-button" disabled={isSubmitting || articleStatus === 'Awaiting Admin Review'}>
                  {isSubmitting ? 'Submitting...' : (articleStatus === 'Awaiting Admin Review' ? 'Submitted for Review' : 'Submit Article for Review')}
                </button>
                {submitStatus && <p className="text-sm text-center font-medium text-accent animate-pulse">{submitStatus}</p>}
                <button onClick={() => onPublish('Published to WP Draft')} className="w-full secondary-button">Save as Draft in WordPress</button>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div
      className="p-6 bg-card-bg rounded-xl shadow-2xl border border-border-color"
      data-chunk-version={PUBLISHING_WORKFLOW_CHUNK_VERSION}
    >
      <h2 className="text-2xl font-bold font-heading text-text-headings mb-4 border-b border-border-color pb-3">Publishing Workflow</h2>
      <div className="space-y-6">
        <div className="p-4 border border-border-color rounded-lg bg-background/50 animate-fade-in">
          <h3 className="font-bold text-lg mb-3 text-text-headings">Review Post Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm text-text-secondary">
            <div><strong className="text-text-primary">Title:</strong> {data.title} <CopyButton textToCopy={data.title} /></div>
            <div><strong className="text-text-primary">Category:</strong> {data.category}</div>
            {/* Added Focus Keyphrase and Meta Description */}
            <div><strong className="text-text-primary">Focus Keyphrase:</strong> {data.seo.focusKeyphrase} <CopyButton textToCopy={data.seo.focusKeyphrase} /></div>
            <div className="md:col-span-2"><strong className="text-text-primary">Meta Description:</strong> {data.seo.metaDescription} <CopyButton textToCopy={data.seo.metaDescription} /></div>
          </div>
        </div>

        {/* Featured Image Section */}
        <div className="p-4 border border-border-color rounded-lg bg-background/50 animate-fade-in">
          <h3 className="font-bold text-lg mb-3 text-text-headings">Featured Image</h3>
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative w-full md:w-1/3 aspect-video rounded-lg overflow-hidden border border-border-color bg-gray-900">
              {heroImageUrl ? (
                <img src={heroImageUrl} alt="Featured" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">No Image</div>
              )}
              {isLoadingHeroImage && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <LoadingSpinner />
                </div>
              )}
            </div>
            <div className="flex-1 w-full">
              <p className="text-sm text-text-secondary mb-3">
                This is the main image that will be used for your blog post.
                If you are not satisfied with it, you can regenerate it using the current AI settings.
              </p>
              <button
                type="button"
                onClick={() => onRegenerateImage('hero')}
                disabled={isLoadingHeroImage}
                className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center gap-2"
              >
                {isLoadingHeroImage ? 'Regenerating...' : '🔄 Regenerate Image'}
              </button>
            </div>
          </div>
        </div>

        <div className="animate-fade-in">{renderPublishingStep()}</div>
      </div>
    </div>
  );
};

export default PublishingWorkflow;
