import { useState, useEffect, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { createPortal } from "react-dom";

interface NavbarProps {
  selectedTopic?: string;
  onTopicChange?: (topic: string) => void;
  topics?: string[];
  tags?: string[];
  selectedTag?: string | null;
  onTagChange?: (tag: string | null) => void;
}

interface MoreMenuProps {
  tags: string[];
  selectedTag?: string | null;
  onTagChange?: (tag: string | null) => void;
  mobile?: boolean;
}

const MoreMenu = ({ tags, selectedTag, onTagChange, mobile = false }: MoreMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mobilePosition, setMobilePosition] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !dropdownRef.current?.contains(target)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!mobile || !isOpen) {
      setMobilePosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const width = Math.min(320, window.innerWidth - 32);
      setMobilePosition({
        left: Math.max(16, Math.min(trigger.right - width, window.innerWidth - width - 16)),
        top: trigger.bottom + 8,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, mobile]);

  if (tags.length === 0) return null;

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className={`${mobile ? "fixed" : "absolute left-1/2 top-full mt-2 -translate-x-1/2"} z-[60] max-h-[65vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-background p-2 shadow-lg`}
      style={mobile && mobilePosition ? { left: mobilePosition.left, top: mobilePosition.top } : undefined}
    >
      <ul aria-label="Filter by tag" className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {tags.map((tag) => (
          <li key={tag}>
            <button
              type="button"
              aria-pressed={selectedTag === tag}
              onClick={() => {
                onTagChange?.(tag);
                setIsOpen(false);
              }}
              className={`min-h-11 w-full break-words rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectedTag === tag ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {tag}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return (
    <div
      ref={menuRef}
      className={mobile ? "" : "relative"}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="true"
        aria-label={selectedTag ? `More tags, filtered by ${selectedTag}` : "More tags"}
        aria-expanded={isOpen}
        className={`px-4 py-1.5 text-sm rounded-full transition-all duration-300 ${
          selectedTag
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        more
      </button>
      {mobile ? mobilePosition && dropdown && createPortal(dropdown, document.body) : dropdown}
    </div>
  );
};

const Navbar = ({
  selectedTopic,
  onTopicChange,
  topics: topicsProp,
  tags = [],
  selectedTag,
  onTagChange,
}: NavbarProps) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [pathname, setPathname] = useState("/");

  const isHomePage = pathname === "/";

  const topics = topicsProp ?? [];

  useEffect(() => {
    setPathname(window.location.pathname);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.documentElement.classList.toggle("dark", newIsDark);
    localStorage.setItem("theme", newIsDark ? "dark" : "light");
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled
            ? "bg-background/95 backdrop-blur-sm"
            : "bg-transparent"
        }`}
      >
        <div className="px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <a
              href="/"
              className="text-lg font-medium tracking-tight hover:opacity-70 transition-opacity duration-300"
            >
              frong.me
            </a>

            {/* Center: Primary Topic filters (desktop only, home page only) */}
            {isHomePage && onTopicChange && (
              <div className="hidden md:flex items-center gap-2">
                <button
                  onClick={() => onTopicChange("everything")}
                  className={`px-4 py-1.5 text-sm rounded-full transition-all duration-300 ${
                    selectedTopic === "everything" && !selectedTag
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  everything
                </button>
                {topics.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => onTopicChange(topic)}
                    className={`px-4 py-1.5 text-sm rounded-full transition-all duration-300 ${
                      selectedTopic === topic && !selectedTag
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {topic}
                  </button>
                ))}
                <MoreMenu tags={tags} selectedTag={selectedTag} onTagChange={onTagChange} />
              </div>
            )}

            {/* Right side: Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 hover:opacity-70 transition-opacity duration-300"
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile: Scrollable Primary Topics below the header */}
      {isHomePage && onTopicChange && (
        <div className="fixed top-16 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm md:hidden">
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 px-6 py-3 w-max">
              {["everything", ...topics].map((topic) => (
                <button
                  key={topic}
                  onClick={() => onTopicChange(topic)}
                  className={`px-4 py-2 text-sm rounded-full whitespace-nowrap transition-all duration-300 ${
                    selectedTopic === topic && !selectedTag
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {topic}
                </button>
              ))}
              <MoreMenu tags={tags} selectedTag={selectedTag} onTagChange={onTagChange} mobile />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
