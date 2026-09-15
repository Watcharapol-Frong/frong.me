import { useState } from "react";
import { set, PatchEvent, useClient } from "sanity";
import type { ImageValue, ObjectInputProps, ObjectSchemaType } from "sanity";

interface UnsplashPhoto {
  id: string;
  urls: { thumb: string; regular: string };
  alt_description: string | null;
}

export function UnsplashImageInput(props: ObjectInputProps<ImageValue, ObjectSchemaType>) {
  const client = useClient({ apiVersion: "2024-01-01" });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnsplashPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const accessKey = import.meta.env.PUBLIC_UNSPLASH_ACCESS_KEY;

  const search = async () => {
    if (!query.trim() || !accessKey) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=12`,
        { headers: { Authorization: `Client-ID ${accessKey}` } }
      );
      const data = await res.json();
      setResults(data.results ?? []);
    } finally {
      setLoading(false);
    }
  };

  const selectPhoto = async (photo: UnsplashPhoto) => {
    setLoading(true);
    try {
      const imageRes = await fetch(photo.urls.regular);
      const blob = await imageRes.blob();
      const asset = await client.assets.upload("image", blob, { filename: `${photo.id}.jpg` });
      props.onChange(
        PatchEvent.from(
          set({
            _type: "image",
            asset: { _type: "reference", _ref: asset._id },
            alt: photo.alt_description ?? "",
          })
        )
      );
      setResults([]);
      setQuery("");
    } finally {
      setLoading(false);
    }
  };

  if (!accessKey) {
    return props.renderDefault(props);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search Unsplash..."
          style={{ flex: 1, padding: "6px 8px", fontSize: 13 }}
        />
        <button type="button" onClick={search} disabled={loading}>
          {loading ? "..." : "Search"}
        </button>
      </div>

      {results.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 4,
            marginBottom: 8,
          }}
        >
          {results.map((photo) => (
            <img
              key={photo.id}
              src={photo.urls.thumb}
              alt={photo.alt_description ?? ""}
              onClick={() => selectPhoto(photo)}
              style={{ cursor: "pointer", width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 4 }}
            />
          ))}
        </div>
      )}

      {props.renderDefault(props)}
    </div>
  );
}
