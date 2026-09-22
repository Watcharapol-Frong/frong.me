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
  cover: string;
  coverWidth?: number;
  coverHeight?: number;
}

interface HomeIslandProps {
  articles: HomeArticle[];
  categories: string[];
}

const HomeIsland = ({ articles, categories }: HomeIslandProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("everything");
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

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
    const tagParam = new URLSearchParams(window.location.search).get("tag");
    if (!tagParam) return;
    const match = categories.find((c) => c.toLowerCase() === tagParam.toLowerCase());
    if (match) setSelectedCategory(match);
  }, [categories]);

  const filteredArticles = useMemo(() => {
    if (selectedCategory === "everything") {
      return articles;
    }
    return articles.filter((article) =>
      article.tags.some((tag) => tag.toLowerCase() === selectedCategory.toLowerCase())
    );
  }, [articles, selectedCategory]);

  return (
    <>
      <main className="min-h-screen bg-background page-transition">
        <Navbar
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          categories={categories}
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
