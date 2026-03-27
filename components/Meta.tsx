import React from 'react';
import { Helmet } from 'react-helmet-async';

interface MetaProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  section?: string;
  tags?: string[];
  schemaData?: Record<string, any> | Record<string, any>[] | null;
  disableDefaultSchema?: boolean;
}

const Meta: React.FC<MetaProps> = ({
  title,
  description,
  path = '',
  image,
  canonicalPath,
  ogType = 'website',
  publishedTime,
  modifiedTime,
  author,
  section,
  tags = [],
  schemaData,
  disableDefaultSchema = false,
}) => {
  const fullTitle = /\|\s*Postgenius Pro\s*$/i.test(title) ? title : `${title} | Postgenius Pro`;
  const siteUrl = 'https://postgeniuspro.com';
  const fullUrl = `${siteUrl}${path}`;
  const canonicalUrl = `${siteUrl}${canonicalPath ?? path}`;
  const defaultImage = `${siteUrl}/favicon.png`;
  const ogImage = image || defaultImage;
  const fallbackSchema = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Postgenius Pro",
      "url": siteUrl,
      "description": "Independent product reviews, clear comparisons, and practical buying guides for smarter shopping decisions.",
      "potentialAction": {
        "@type": "SearchAction",
        "target": `${siteUrl}/blog?search={search_term_string}`,
        "query-input": "required name=search_term_string"
      },
      "publisher": {
        "@type": "Organization",
        "name": "Postgenius Pro",
        "logo": {
          "@type": "ImageObject",
          "url": defaultImage
        }
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Postgenius Pro",
      "url": siteUrl,
      "logo": defaultImage,
      "description": "An editorial destination for independent product reviews, expert comparisons, and practical buying guides."
    }
  ];
  const finalSchema = schemaData ?? (disableDefaultSchema ? null : fallbackSchema);

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
      <meta name="googlebot" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
      <meta name="theme-color" content="#ffffff" />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="Postgenius Pro" />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      {ogType === 'article' && publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {ogType === 'article' && modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
      {ogType === 'article' && author && <meta property="article:author" content={author} />}
      {ogType === 'article' && section && <meta property="article:section" content={section} />}
      {ogType === 'article' && tags.map(tag => (
        <meta key={tag} property="article:tag" content={tag} />
      ))}

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={fullUrl} />
      <meta property="twitter:title" content={fullTitle} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={ogImage} />

      {finalSchema && (
        <script type="application/ld+json">
          {JSON.stringify(finalSchema)}
        </script>
      )}
    </Helmet>
  );
};

export default Meta;
