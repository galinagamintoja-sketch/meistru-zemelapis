"use client";

import { useState, type CSSProperties } from "react";

const failedImageUrls = new Set<string>();

type Props = {
  src?: string | null;
  alt: string;
  specialistName?: string;
  trade?: string;
  className?: string;
  loading?: "eager" | "lazy";
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
  src,
  alt,
  specialistName,
  trade,
  className = "",
  loading = "lazy",
  fallbackText,
  style
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src || hasFailedProfileImage(src);
  const classes = ["safe-profile-image", failed ? "is-fallback" : "has-image", className].filter(Boolean).join(" ");

  return (
    <span className={classes} style={style}>
      {failed ? (
        <span className="safe-profile-image-fallback" aria-label={fallbackText || `${specialistName || "Specialisto"} nuotraukos nėra`}>
          <span aria-hidden="true">{safeProfileImageInitial(specialistName, trade)}</span>
          {fallbackText ? <small>{fallbackText}</small> : null}
        </span>
      ) : (
        // Native image events are required so failed remote URLs can be replaced immediately.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={loading}
          onError={() => {
            rememberFailedProfileImage(src);
            setFailedSrc(src);
          }}
        />
      )}
    </span>
  );
}
