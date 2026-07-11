import React, { useEffect, useRef, useMemo, Fragment } from "react";

import styles from "./home.module.scss";

import { IconButton } from "./button";
import SettingsIcon from "../icons/settings.svg";
import AddIcon from "../icons/add.svg";
import MaskIcon from "../icons/mask.svg";
import DragIcon from "../icons/drag.svg";
import DiscoveryIcon from "../icons/discovery.svg";
import NeatIcon from "../icons/neat.svg";
import MenuIcon from "../icons/menu.svg";
import FileIcon from "../icons/file.svg";

import Locale from "../locales";

import { useChatStore } from "../store/chat";
import { useAppConfig } from "../store/config";

import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  NARROW_SIDEBAR_WIDTH,
  Path,
} from "../constant";

import { Link, useLocation, useNavigate } from "react-router-dom";
import { isIOS, useCompactScreen, useMobileScreen } from "../utils";
import dynamic from "next/dynamic";
import clsx from "clsx";

const ChatList = dynamic(async () => (await import("./chat-list")).ChatList, {
  loading: () => null,
});

const limitSideBarWidth = (x: number) => Math.min(MAX_SIDEBAR_WIDTH, x);

export function useHotKey() {
  const chatStore = useChatStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey) {
        if (e.key === "ArrowUp") {
          chatStore.nextSession(-1);
        } else if (e.key === "ArrowDown") {
          chatStore.nextSession(1);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}

export function useDragSideBar() {
  const config = useAppConfig();
  const startX = useRef(0);
  const startDragWidth = useRef(config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
  const lastUpdateTime = useRef(0);
  if (lastUpdateTime.current === 0) {
    lastUpdateTime.current = Date.now();
  }

  const toggleSideBar = () => {
    config.update((config) => {
      if (config.sidebarWidth < MIN_SIDEBAR_WIDTH) {
        config.sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
      } else {
        config.sidebarWidth = NARROW_SIDEBAR_WIDTH;
      }
    });
  };

  const onDragStart = (e: MouseEvent) => {
    // Remembers the initial width each time the mouse is pressed
    startX.current = e.clientX;
    startDragWidth.current = config.sidebarWidth;
    const dragStartTime = Date.now();

    const handleDragMove = (e: MouseEvent) => {
      if (Date.now() < lastUpdateTime.current + 20) {
        return;
      }
      lastUpdateTime.current = Date.now();
      const d = e.clientX - startX.current;
      const nextWidth = limitSideBarWidth(startDragWidth.current + d);
      config.update((config) => {
        if (nextWidth < MIN_SIDEBAR_WIDTH) {
          config.sidebarWidth = NARROW_SIDEBAR_WIDTH;
        } else {
          config.sidebarWidth = nextWidth;
        }
      });
    };

    const handleDragEnd = () => {
      // In useRef the data is non-responsive, so `config.sidebarWidth` can't get the dynamic sidebarWidth
      window.removeEventListener("pointermove", handleDragMove);
      window.removeEventListener("pointerup", handleDragEnd);

      // if user click the drag icon, should toggle the sidebar
      const shouldFireClick = Date.now() - dragStartTime < 300;
      if (shouldFireClick) {
        toggleSideBar();
      }
    };

    window.addEventListener("pointermove", handleDragMove);
    window.addEventListener("pointerup", handleDragEnd);
  };

  const isCompactScreen = useCompactScreen();
  const shouldNarrow =
    !isCompactScreen && config.sidebarWidth < MIN_SIDEBAR_WIDTH;

  useEffect(() => {
    const barWidth = shouldNarrow
      ? NARROW_SIDEBAR_WIDTH
      : limitSideBarWidth(config.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
    const sideBarWidth = isCompactScreen ? "100vw" : `${barWidth}px`;
    document.documentElement.style.setProperty("--sidebar-width", sideBarWidth);
  }, [config.sidebarWidth, isCompactScreen, shouldNarrow]);

  return {
    onDragStart,
    shouldNarrow,
    toggleSideBar,
  };
}
export function SideBarContainer(props: {
  children: React.ReactNode;
  onDragStart: (e: MouseEvent) => void;
  shouldNarrow: boolean;
  className?: string;
  isMobileHidden?: boolean;
  isMobileOpen?: boolean;
}) {
  const isMobileScreen = useMobileScreen();
  const isCompactScreen = useCompactScreen();
  const isIOSMobile = useMemo(
    () => isIOS() && isMobileScreen,
    [isMobileScreen],
  );
  const {
    children,
    className,
    isMobileHidden,
    isMobileOpen,
    onDragStart,
    shouldNarrow,
  } = props;
  return (
    <div
      id="mobile-sidebar-drawer"
      aria-hidden={isMobileHidden ? true : undefined}
      role={isMobileOpen ? "dialog" : undefined}
      aria-modal={isMobileOpen ? true : undefined}
      aria-label={Locale.Chat.Actions.ChatList}
      tabIndex={isMobileOpen ? -1 : undefined}
      className={clsx(styles.sidebar, className, {
        [styles["narrow-sidebar"]]: shouldNarrow,
      })}
      style={{
        // #3016 disable transition on ios mobile screen
        transition: isCompactScreen && isIOSMobile ? "none" : undefined,
        display: isMobileHidden ? "none" : undefined,
        left: isMobileOpen ? 0 : undefined,
      }}
    >
      {children}
      <div
        className={styles["sidebar-drag"]}
        onPointerDown={(e) => onDragStart(e as any)}
      >
        <DragIcon />
      </div>
    </div>
  );
}

export function SideBarHeader(props: {
  title?: string | React.ReactNode;
  subTitle?: string | React.ReactNode;
  logo?: React.ReactNode;
  children?: React.ReactNode;
  shouldNarrow?: boolean;
  onToggle?: () => void;
}) {
  const { title, subTitle, logo, children, shouldNarrow, onToggle } = props;
  return (
    <Fragment>
      <div
        className={clsx(styles["sidebar-header"], {
          [styles["sidebar-header-narrow"]]: shouldNarrow,
        })}
        data-tauri-drag-region
      >
        {onToggle && (
          <button
            type="button"
            className={clsx("clickable", styles["sidebar-toggle-button"])}
            onClick={onToggle}
            aria-label={shouldNarrow ? "展开栏" : "折叠栏"}
            title={shouldNarrow ? "展开栏" : "折叠栏"}
          >
            <MenuIcon />
          </button>
        )}
        <div className={styles["sidebar-title-container"]}>
          <div
            className={clsx(styles["sidebar-title"], "logo-text")}
            data-tauri-drag-region
            style={{ visibility: "visible" }}
          >
            {title}
          </div>
          <div className={styles["sidebar-sub-title"]}>{subTitle}</div>
        </div>
        <div className={clsx(styles["sidebar-logo"], "no-dark")}>{logo}</div>
      </div>
      {children}
    </Fragment>
  );
}

export function SideBarBody(props: {
  children: React.ReactNode;
  backgroundAction?: React.ReactNode;
}) {
  const { backgroundAction, children } = props;

  return (
    <div className={styles["sidebar-body"]}>
      {backgroundAction}
      <div className={styles["sidebar-body-content"]}>{children}</div>
    </div>
  );
}

export function SideBarTail(props: {
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}) {
  const { primaryAction, secondaryAction } = props;

  return (
    <div className={styles["sidebar-tail"]}>
      <div className={styles["sidebar-actions"]}>{primaryAction}</div>
      <div className={styles["sidebar-actions"]}>{secondaryAction}</div>
    </div>
  );
}

export function SideBar(props: {
  className?: string;
  isMobileHidden?: boolean;
  isMobileOpen?: boolean;
}) {
  useHotKey();
  const { onDragStart, shouldNarrow, toggleSideBar } = useDragSideBar();
  const isCompactScreen = useCompactScreen();
  const navigate = useNavigate();
  const location = useLocation();
  const config = useAppConfig();
  const chatStore = useChatStore();

  const startNewChat = () => {
    if (config.dontShowMaskSplashScreen) {
      chatStore.newSession();
      navigate(Path.Chat);
    } else {
      navigate(Path.NewChat);
    }
  };

  const primaryNavItems = [
    {
      label: Locale.Home.NewChat,
      icon: <AddIcon />,
      path: Path.NewChat,
      onClick: startNewChat,
    },
    {
      label: Locale.SearchChat.Name,
      icon: <DiscoveryIcon />,
      path: Path.SearchChat,
      onClick: () => navigate(Path.SearchChat),
    },
    {
      label: Locale.Mask.Name,
      icon: <MaskIcon />,
      path: Path.Masks,
      onClick: () => navigate(Path.Masks, { state: { fromHome: true } }),
    },
    {
      label: Locale.ArtifactLibrary.Title,
      icon: <FileIcon />,
      path: Path.Artifacts,
      onClick: () => navigate(Path.Artifacts),
    },
  ];

  return (
    <SideBarContainer
      onDragStart={onDragStart}
      shouldNarrow={shouldNarrow}
      className={props.className}
      isMobileHidden={props.isMobileHidden}
      isMobileOpen={props.isMobileOpen}
    >
      <SideBarHeader
        title="NeatChat"
        logo={<NeatIcon width={32} height={32} />}
        shouldNarrow={shouldNarrow}
        onToggle={isCompactScreen ? undefined : toggleSideBar}
      >
        <div className={styles["sidebar-header-bar"]}>
          <div
            className={styles["sidebar-primary-nav"]}
            role="navigation"
            aria-label={Locale.Home.PrimarySection}
          >
            {!shouldNarrow && (
              <div className={styles["sidebar-section-label"]}>
                {Locale.Home.PrimarySection}
              </div>
            )}
            {primaryNavItems.map((item) => (
              <button
                type="button"
                key={item.path}
                className={clsx(styles["sidebar-nav-item"], {
                  [styles["sidebar-nav-item-active"]]:
                    location.pathname === item.path,
                })}
                onClick={item.onClick}
                aria-label={item.label}
                aria-current={
                  location.pathname === item.path ? "page" : undefined
                }
                title={shouldNarrow ? item.label : undefined}
              >
                {item.icon}
                {!shouldNarrow && <span>{item.label}</span>}
              </button>
            ))}
          </div>
        </div>
      </SideBarHeader>
      <SideBarBody
        backgroundAction={
          <button
            type="button"
            className={styles["sidebar-body-background-action"]}
            aria-label="Return home"
            onClick={() => {
              navigate(Path.Home);
            }}
          />
        }
      >
        {!shouldNarrow && (
          <div className={styles["sidebar-section-label"]}>
            {Locale.SearchChat.Page.Recent}
          </div>
        )}
        {!shouldNarrow && <ChatList narrow={shouldNarrow} />}
      </SideBarBody>
      <SideBarTail
        primaryAction={
          isCompactScreen ? (
            <div className={styles["sidebar-mobile-account"]}>
              <div
                className={clsx(
                  styles["sidebar-mobile-account-avatar"],
                  "no-dark",
                )}
              >
                <span
                  className={styles["sidebar-mobile-pixel-face"]}
                  aria-hidden="true"
                >
                  <span className={styles["sidebar-mobile-pixel-eye-left"]} />
                  <span className={styles["sidebar-mobile-pixel-eye-right"]} />
                  <span className={styles["sidebar-mobile-pixel-mouth"]} />
                </span>
              </div>
              <div className={styles["sidebar-mobile-account-copy"]}>
                <div className={styles["sidebar-mobile-account-name"]}>
                  NeatChat
                </div>
                <div className={styles["sidebar-mobile-account-meta"]}>
                  Local
                </div>
              </div>
              <Link
                to={Path.Settings}
                className={clsx(styles["sidebar-mobile-account-settings"], {
                  [styles["sidebar-settings-link-active"]]:
                    location.pathname === Path.Settings,
                })}
                aria-label={Locale.Settings.Title}
                aria-current={
                  location.pathname === Path.Settings ? "page" : undefined
                }
              >
                <IconButton
                  aria={Locale.Settings.Title}
                  icon={<SettingsIcon />}
                  bordered
                />
              </Link>
            </div>
          ) : (
            <div className={styles["sidebar-action"]}>
              <Link
                to={Path.Settings}
                className={clsx(styles["sidebar-settings-link"], {
                  [styles["sidebar-settings-link-active"]]:
                    location.pathname === Path.Settings,
                })}
                aria-current={
                  location.pathname === Path.Settings ? "page" : undefined
                }
              >
                <IconButton
                  aria={Locale.Settings.Title}
                  icon={<SettingsIcon />}
                  shadow
                />
                <span className={styles["sidebar-settings-label"]}>
                  {Locale.Settings.Title}
                </span>
              </Link>
            </div>
          )
        }
        secondaryAction={null}
      />
    </SideBarContainer>
  );
}
