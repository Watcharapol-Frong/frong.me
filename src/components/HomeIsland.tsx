import { useState, useMemo, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import FloatingNav from "@/components/FloatingNav";
import AnnouncementBanner, { type AnnouncementBannerProps } from "@/components/AnnouncementBanner";

// Set this to show a site-wide banner above the grid (e.g. a linked event or campaign article).
// Leave it null when there's nothing to announce.
const activeAnnouncement = null as AnnouncementBannerProps | null;
// Example:
// const activeAnnouncement: AnnouncementBannerProps | null = {
//   id: "election-2026",
//   message: "New article: what's on the ballot this year.",
//   href: "/articles/some-slug",
//   ctaLabel: "Read more",
// };

interface HomeArticle {
  slug: string;
  title: string;
  tags: string[];
  primaryTopic: string | null;
  cover: string;
  coverWidth?: number;
  coverHeight?: number;
}

interface HomeIslandProps {
  articles: HomeArticle[];
  topics: string[];
}

const HomeIsland = ({ articles, topics }: HomeIslandProps) => {
  const [selectedTopic, setSelectedTopic] = useState<string>("everything");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const tags = useMemo(() => {
    const primaryTopicNames = new Set(topics.map((topic) => topic.toLocaleLowerCase()));
    const counts = new Map<string, number>();
    const tagLabels = new Map<string, string>();
    for (const article of articles) {
      for (const tag of new Set(article.tags.map((value) => value.trim()).filter(Boolean))) {
        if (!primaryTopicNames.has(tag.toLocaleLowerCase())) {
          const key = tag.toLocaleLowerCase();
          counts.set(key, (counts.get(key) ?? 0) + 1);
          if (!tagLabels.has(key)) tagLabels.set(key, tag);
        }
      }
    }
    return [...counts.keys()].sort((left, right) =>
      (counts.get(right)! - counts.get(left)!) || left.localeCompare(right),
    ).map((key) => tagLabels.get(key)!);
  }, [articles, topics]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const topicParam = new URLSearchParams(window.location.search).get("topic");
    const tagParam = new URLSearchParams(window.location.search).get("tag");
    if (tagParam) {
      const match = tags.find((tag) => tag.toLocaleLowerCase() === tagParam.toLocaleLowerCase());
      if (match) {
        setSelectedTag(match);
        return;
      }
    }
    if (topicParam) {
      const match = topics.find((topic) => topic.toLowerCase() === topicParam.toLowerCase());
      if (match) setSelectedTopic(match);
    }
  }, [tags, topics]);

  const filteredArticles = useMemo(() => {
    if (selectedTag) {
      const selectedKey = selectedTag.toLocaleLowerCase();
      return articles.filter((article) => article.tags.some((tag) => tag.toLocaleLowerCase() === selectedKey));
    }
    if (selectedTopic === "everything") {
      return articles;
    }
    return articles.filter((article) => article.primaryTopic === selectedTopic);
  }, [articles, selectedTag, selectedTopic]);

  return (
    <>
      <main className="min-h-screen bg-background page-transition">
        <Navbar
          selectedTopic={selectedTopic}
          onTopicChange={(topic) => {
            setSelectedTopic(topic);
            setSelectedTag(null);
          }}
          topics={topics}
          tags={tags}
          selectedTag={selectedTag}
          onTagChange={setSelectedTag}
        />

        {/* Article Grid */}
        <section ref={sectionRef} className="pt-32 md:pt-24 pb-24 px-6">
          {activeAnnouncement && <AnnouncementBanner {...activeAnnouncement} />}

          {/* One responsive list avoids duplicating every image and card in the DOM. */}
          <div className="grid grid-cols-2 gap-3 md:block md:columns-2 lg:columns-3 3xl:columns-4 md:gap-4">
            {filteredArticles.map((article, index) => (
              <a
                key={article.slug}
                href={`/articles/${article.slug}`}
                className={`project-card group block md:mb-4 md:break-inside-avoid transition-all duration-700 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-16"
                }`}
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-muted aspect-[4/5] md:aspect-auto">
                  <img
                    src={article.cover}
                    alt={article.title}
                    width={article.coverWidth}
                    height={article.coverHeight}
                    className="w-full h-full md:h-auto object-cover"
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "auto"}
                  />
                </div>

                <div className="pt-2 pb-3 md:pt-3 md:pb-4">
                  <h3 className="text-xs md:text-sm font-medium group-hover:opacity-70 transition-opacity duration-300 line-clamp-1">
                    {article.title}
                  </h3>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 line-clamp-1 md:line-clamp-none">
                    {article.tags.map((tag) => `#${tag}`).join(" ")}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
      <FloatingNav />
    </>
  );
};

export default HomeIsland;
