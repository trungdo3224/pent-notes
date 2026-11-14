import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "../../components/editor/NoteEditor";
import { SessionModal } from "../../components/modals/SessionModal";
import { FolderNavbar } from "../../components/navbar/FolderNavbar";
import { FolderExplorer } from "../../components/sidebar/FolderExplorer";
import { sessionApi } from "../../lib/sessionManager";
import { useNotesStore } from "../../store/useNotesStore";
import { TopLevelFolder } from "../../types";
import { resetNotesStore } from "../testUtils";

function seedWorkspace(): TopLevelFolder[] {
  const folders: TopLevelFolder[] = [
    {
      id: "top-1",
      name: "Engagement",
      groupId: "grp-1",
      items: [
        {
          id: "sub-1",
          type: "folder",
          name: "Recon",
          children: [
            {
              id: "n-scope",
              type: "note",
              title: "Scope Notes",
              content: "Initial reconnaissance [[Exploit Script.py]]",
              updatedAt: "2026-02-01",
              fileType: "markdown",
            },
            {
              id: "n-code",
              type: "note",
              title: "Exploit Script.py",
              content: "print('hello')\nprint('world')",
              updatedAt: "2026-02-01",
              fileType: "code",
            },
          ],
        },
        {
          id: "n-spec",
          type: "note",
          title: "Target Architecture.pdf",
          content: "",
          updatedAt: "2026-02-01",
          fileType: "pdf",
          pdfData: "data:application/pdf;base64,JVBERi0xLjQ=",
        },
      ],
    },
    {
      id: "top-2",
      name: "Reporting",
      items: [
        {
          id: "n-summary",
          type: "note",
          title: "Executive Summary",
          content: "Findings summary",
          updatedAt: "2026-02-02",
          fileType: "markdown",
        },
      ],
    },
  ];

  useNotesStore.setState({
    folders,
    tabGroups: [{ id: "grp-1", name: "Active Ops", color: "blue" }],
    selectedFolderId: "top-1",
    selectedNoteByFolder: { "top-1": "n-scope", "top-2": "n-summary" },
    openNotesByFolder: {
      "top-1": ["n-scope", "n-code"],
      "top-2": ["n-summary"],
    },
    expandedFolderIds: ["sub-1"],
    activeNoteContents: {
      "n-scope": "Initial reconnaissance [[Exploit Script.py]]",
      "n-code": "print('hello')\nprint('world')",
      "n-summary": "Findings summary",
    },
  });

  return folders;
}

describe("UI component integration with useNotesStore", () => {
  beforeEach(() => {
    resetNotesStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders FolderNavbar tabs and groups, handles inline rename and context menu", () => {
    seedWorkspace();
    const onOpenSearch = vi.fn();

    render(<FolderNavbar onOpenSearch={onOpenSearch} />);

    // Renders group chip & ungrouped folder tab
    expect(screen.getByText("Active Ops")).toBeInTheDocument();
    const reportingText = screen.getByText("Reporting");
    const reportingTab = reportingText.closest(".folder-tab") as HTMLElement;
    expect(reportingTab).toBeTruthy();

    // Double-clicking ungrouped folder tab activates inline rename; Enter commits
    fireEvent.doubleClick(reportingTab);
    const renameInput = reportingTab.querySelector("input") as HTMLInputElement;
    expect(renameInput).toBeTruthy();
    fireEvent.change(renameInput, { target: { value: "Final Report" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    expect(
      useNotesStore.getState().folders.find((f) => f.id === "top-2")?.name,
    ).toBe("Final Report");

    // Pressing Escape on rename cancels without mutating
    fireEvent.doubleClick(
      screen.getByText("Final Report").closest(".folder-tab") as HTMLElement,
    );
    const secondInput = document.querySelector(
      ".folder-tab-input",
    ) as HTMLInputElement;
    fireEvent.change(secondInput, { target: { value: "Should Cancel" } });
    fireEvent.keyDown(secondInput, { key: "Escape" });
    expect(
      useNotesStore.getState().folders.find((f) => f.id === "top-2")?.name,
    ).toBe("Final Report");

    // Clicking group chip opens dropdown menu showing its grouped tab
    const groupChip = screen
      .getByText("Active Ops")
      .closest(".tab-group-chip")!;
    fireEvent.click(groupChip);
    expect(
      screen.getByRole("menu", { name: "Active Ops tabs" }),
    ).toBeInTheDocument();

    // Right-click opens context menu; Escape dismisses it
    fireEvent.contextMenu(
      screen.getByText("Final Report").closest(".folder-tab") as HTMLElement,
    );
    expect(
      screen.getByRole("menu", { name: "Tab group actions" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("menu", { name: "Tab group actions" }),
    ).not.toBeInTheDocument();
  });

  it("renders FolderExplorer tree, supports inline rename, selection, and right-click note creation", async () => {
    seedWorkspace();
    render(<FolderExplorer />);

    expect(screen.getByText("Recon")).toBeInTheDocument();
    expect(screen.getByText("Scope Notes")).toBeInTheDocument();
    expect(screen.getByText("Exploit Script.py")).toBeInTheDocument();
    expect(screen.getByText("PYTH")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();

    // Select code file row
    fireEvent.click(screen.getByText("Exploit Script.py"));
    expect(useNotesStore.getState().selectedNoteByFolder["top-1"]).toBe(
      "n-code",
    );

    // Right-click note row -> Rename note -> Enter commits
    const scopeRow = screen.getByText("Scope Notes").closest(".explorer-row")!;
    fireEvent.contextMenu(scopeRow);
    const menu = screen.getByRole("menu", { name: "Sidebar context actions" });
    expect(menu).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Rename note" }));
    const noteRenameInput = document.querySelector(
      ".explorer-rename-input",
    ) as HTMLInputElement;
    expect(noteRenameInput).toBeTruthy();
    fireEvent.change(noteRenameInput, {
      target: { value: "Updated Scope" },
    });
    fireEvent.keyDown(noteRenameInput, { key: "Enter" });

    expect(useNotesStore.getState().folders[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sub-1",
          children: expect.arrayContaining([
            expect.objectContaining({ id: "n-scope", title: "Updated Scope" }),
          ]),
        }),
      ]),
    );

    // Right-click subfolder -> New note adds a note into Recon
    fireEvent.contextMenu(screen.getByText("Recon").closest(".explorer-row")!);
    fireEvent.click(screen.getByRole("menuitem", { name: "New note" }));
    await waitFor(() => {
      const sub = useNotesStore
        .getState()
        .folders[0].items.find((n) => n.id === "sub-1");
      expect(sub?.type === "folder" ? sub.children.length : 0).toBe(3);
    });
  });

  it("renders NoteEditor single view & PaneSplitTree multi-pane view with breadcrumbs, links, and switcher", async () => {
    seedWorkspace();
    const { container } = render(<NoteEditor />);

    // Single view breadcrumb, word count, title input, and connected notes footer
    const breadcrumb = screen.getByLabelText("Note path");
    expect(breadcrumb).toHaveTextContent("Engagement");
    expect(breadcrumb).toHaveTextContent("Recon");
    expect(breadcrumb).toHaveTextContent("Scope Notes");

    expect(screen.getByDisplayValue("Scope Notes")).toBeInTheDocument();
    expect(screen.getByText("4 words")).toBeInTheDocument();
    expect(screen.getByText("Connected notes (1)")).toBeInTheDocument();
    expect(container.querySelector(".connected-note-title")?.textContent).toBe(
      "Exploit Script.py",
    );

    // Link popover filters workspace notes and toggles link
    fireEvent.click(
      screen.getByRole("button", { name: "Link notes and attach files" }),
    );
    expect(screen.getByText("CONNECT WITH NOTES")).toBeInTheDocument();
    const linkSearch = screen.getByPlaceholderText("Search notes to link...");
    fireEvent.change(linkSearch, { target: { value: "Executive" } });
    fireEvent.click(screen.getByText("Executive Summary"));

    await waitFor(() => {
      expect(useNotesStore.getState().activeNoteContents["n-scope"]).toContain(
        "[[Executive Summary]]",
      );
    });

    // Open second note in split view -> switches to PaneSplitTree with 2 panes
    useNotesStore.getState().openInSplitView("top-1", "n-code", "horizontal");

    await waitFor(() => {
      expect(screen.getByText("Split View (2 Panes)")).toBeInTheDocument();
    });
    expect(screen.getByText("Pane 1")).toBeInTheDocument();
    expect(screen.getAllByText("Pane 2").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("PYTHON")).toBeInTheDocument();
    expect(screen.getByText("2L")).toBeInTheDocument();
    expect(screen.getByText("6w")).toBeInTheDocument();

    // Pane 2 quick file switcher popover filters & selects note
    const switchButtons = screen.getAllByRole("button", {
      name: "Switch file",
    });
    fireEvent.click(switchButtons[1]);
    const paneHeader = screen.getByText("OPEN FILE IN PANE 2");
    expect(paneHeader).toBeInTheDocument();
    const popover = paneHeader.closest(".editor-link-popover")!;
    fireEvent.click(
      popover.querySelector(".editor-link-option .editor-link-option-title")
        ?.textContent === "Executive Summary"
        ? (popover.querySelector(".editor-link-option") as HTMLElement)
        : (Array.from(popover.querySelectorAll(".editor-link-option")).find(
            (btn) => btn.textContent?.includes("Executive Summary"),
          ) as HTMLElement),
    );

    await waitFor(() => {
      const breadcrumbs = screen.getAllByLabelText("Note path");
      expect(
        breadcrumbs.some((el) => el.textContent?.includes("Executive Summary")),
      ).toBe(true);
    });
  });

  it("renders SessionModal and commits inline session rename", async () => {
    const listSpy = vi.spyOn(sessionApi, "listSessions").mockResolvedValue([
      {
        id: "default",
        name: "Default Workspace",
        createdAt: 1,
        updatedAt: 2,
        folderCount: 2,
        noteCount: 4,
      },
    ]);
    const renameSpy = vi.spyOn(sessionApi, "renameSession").mockResolvedValue();

    useNotesStore.setState({
      isSessionModalOpen: true,
      currentSessionId: "default",
      currentSessionName: "Default Workspace",
    });

    render(<SessionModal />);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTitle("Rename current session"));
    const input = screen.getByDisplayValue("Default Workspace");
    fireEvent.change(input, { target: { value: "Bug Bounty Vault" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(renameSpy).toHaveBeenCalledWith("default", "Bug Bounty Vault");
    });
    expect(useNotesStore.getState().currentSessionName).toBe(
      "Bug Bounty Vault",
    );
  });

  it("opens SessionModal from FolderNavbar pill in expanded/slim modes and from the + menu", async () => {
    seedWorkspace();
    vi.spyOn(sessionApi, "listSessions").mockResolvedValue([
      {
        id: "default",
        name: "Default Session",
        createdAt: 1,
        updatedAt: 2,
        folderCount: 2,
        noteCount: 4,
      },
    ]);

    useNotesStore.setState({
      isNavbarCollapsed: false,
      isSessionModalOpen: false,
      currentSessionId: "default",
      currentSessionName: "Default Session",
    });

    render(
      <>
        <FolderNavbar onOpenSearch={vi.fn()} />
        <SessionModal />
      </>,
    );

    // 1. Expanded navbar SessionPillButton
    fireEvent.click(screen.getByRole("button", { name: "Manage sessions" }));
    expect(useNotesStore.getState().isSessionModalOpen).toBe(true);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Session Management" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(useNotesStore.getState().isSessionModalOpen).toBe(false);

    // 2. Slim navbar SessionPillButton
    useNotesStore.setState({ isNavbarCollapsed: true });
    await waitFor(() => {
      expect(
        document.querySelector(".navbar-slim-controls .session-navbar-pill"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Manage sessions" }));
    expect(useNotesStore.getState().isSessionModalOpen).toBe(true);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Session Management" }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(useNotesStore.getState().isSessionModalOpen).toBe(false);

    // 3. "+" dropdown menu -> "Manage sessions..."
    fireEvent.click(screen.getByRole("button", { name: "Create or import" }));
    fireEvent.click(screen.getByRole("button", { name: "Manage sessions..." }));
    expect(useNotesStore.getState().isSessionModalOpen).toBe(true);
    await waitFor(() => {
      expect(
        screen.getByRole("dialog", { name: "Session Management" }),
      ).toBeInTheDocument();
    });
  });
});
