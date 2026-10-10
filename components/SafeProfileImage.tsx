"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";

const failedImageUrls = new Set<string>();

type Props = {
  src?: string | null;
  fallbackSrcs?: string[];
  alt: string;
  specialistName?: string;
  trade?: string;
  className?: string;
  loading?: "eager" | "lazy";
  sizes?: string;
  fallbackText?: string;
  style?: CSSProperties;
};

export function hasFailedProfileImage(src?: string | null) {
  return Boolean(src && failedImageUrls.has(src));
}

export function rememberFailedProfileImage(src: string) {
  failedImageUrls.add(src);
}

export function safeProfileImageInitial(specialistName?: string, trade?: string) {
  return (specialistName?.trim().charAt(0) || trade?.trim().charAt(0) || "?").toUpperCase();
}

export default function SafeProfileImage({
  src: preferredSrc,
  fallbackSrcs = [],
  alt,
  specialistName,
  trade,
  className = "",
  loading = "lazy",
  sizes = "(max-width: 620px) 88px, 150px",
  fallbackText,
  style
}: Props) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const src = [preferredSrc, ...fallbackSrcs].find((candidate) =>
    candidate && !failedSources.includes(candidate) && !hasFailedProfileImage(candidate));
  const failed = !src;
  const classes = ["safe-profile-image", failed ? "is-fallback" : "has-image", className].filter(Boolean).join(" ");

  return (
    <span className={classes} style={style}>
      {failed ? (
        <span className="safe-profile-image-fallback" aria-label={fallbackText || `${specialistName || "Specialisto"} nuotraukos nėra`}>
          <span aria-hidden="true">{safeProfileImageInitial(specialistName, trade)}</span>
          {fallbackText ? <small>{fallbackText}</small> : null}
        </span>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          // Managed photos are already resized. Serve them directly: Vercel
          // rejects optimisation of these dynamic API URLs. External legacy
          // photos also need no optimiser domain allowlist to display.
          unoptimized={src.startsWith("/api/public/profile-photos/") || /^https?:\/\//.test(src)}
          sizes={sizes}
          priority={loading === "eager"}
          onError={() => {
            rememberFailedProfileImage(src);
            setFailedSources((previous) => [...previous, src]);
          }}
        />
      )}
    </span>
  );
}
