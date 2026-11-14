import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteDocumentView } from "../../components/editor/NoteDocumentView";
import { ConnectedNotesFooter } from "../../components/shared/ConnectedNotesFooter";
import { FloatingContextMenu } from "../../components/shared/FloatingContextMenu";
import { InlineRenameInput } from "../../components/shared/InlineRenameInput";
import { NoteBreadcrumb } from "../../components/shared/NoteBreadcrumb";
import {
  EditorNoteStatus,
  NoteFileIcon,
} from "../../components/shared/NoteMetaBadges";
import { SidebarResizer } from "../../components/shared/SidebarResizer";
import { WorkspaceNotePicker } from "../../components/shared/WorkspaceNotePicker";
import { LinkedNoteInfo, WorkspaceNoteOption } from "../../lib/catalogUtils";
import { NoteItem } from "../../types";

function makeNote(overrides: Partial<NoteItem> = {}): NoteItem {
  return {
    id: "note-1",
    type: "note",
    title: "Test Note",
    content: "hello world",
    updatedAt: "2026-03-01",
    fileType: "markdown",
    ...overrides,
  };
}

describe("Shared and extracted UI primitives", () => {
  it("InlineRenameInput focuses, commits once on Enter/blur, and skips commit on Escape", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <InlineRenameInput
        value="Initial"
        ariaLabel="Rename item"
        onChange={onChange}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "Rename item",
    }) as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    // Re-mount cleanly for Escape cancellation test (ensuring blur right after Escape doesn't commit)
    const cancelSpy = vi.fn();
    const commitAfterCancelSpy = vi.fn();
    rerender(
      <InlineRenameInput
        key="escape-case"
        value="Styled"
        variant="ui"
        ariaLabel="Rename session"
        onChange={onChange}
        onCommit={commitAfterCancelSpy}
        onCancel={cancelSpy}
      />,
    );
    const uiInput = screen.getByRole("textbox", { name: "Rename session" });
    fireEvent.keyDown(uiInput, { key: "Escape" });
    fireEvent.blur(uiInput);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(commitAfterCancelSpy).not.toHaveBeenCalled();
  });

  it("FloatingContextMenu handles open/closed state, Escape, outside click, and ignore predicate", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <FloatingContextMenu
        isOpen={false}
        x={12}
        y={24}
        onClose={onClose}
        className="custom-menu"
        ariaLabel="Actions menu"
      >
        <button type="button">Action</button>
      </FloatingContextMenu>,
    );
    expect(
      screen.queryByRole("menu", { name: "Actions menu" }),
    ).not.toBeInTheDocument();

    rerender(
      <div>
        <button type="button" className="ignored-trigger">
          Trigger
        </button>
        <div className="outside-target">Outside</div>
        <FloatingContextMenu
          isOpen
          x={40}
          y={80}
          onClose={onClose}
          className="custom-menu"
          ariaLabel="Actions menu"
          shouldIgnoreOutsideClick={(el) =>
            Boolean(el.closest(".ignored-trigger"))
          }
        >
          <button type="button">Inside item</button>
        </FloatingContextMenu>
      </div>,
    );

    const menu = screen.getByRole("menu", { name: "Actions menu" });
    expect(menu).toHaveStyle({ top: "80px", left: "40px" });

    fireEvent.mouseDown(screen.getByText("Inside item"));
    fireEvent.mouseDown(screen.getByText("Trigger"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByText("Outside"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("NoteBreadcrumb renders folder hierarchy and current note segment", () => {
    const { container } = render(
      <NoteBreadcrumb segments={["Engagement", "Recon", "Scope"]} />,
    );
    expect(screen.getByLabelText("Note path")).toBeInTheDocument();
    expect(container.querySelectorAll(".breadcrumb-part")).toHaveLength(2);
    expect(container.querySelector(".breadcrumb-current")).toHaveTextContent(
      "Scope",
    );
  });

  it("NoteFileIcon and EditorNoteStatus render full and compact metadata across file types", () => {
    const pdfNote = makeNote({
      title: "Architecture.pdf",
      fileType: "pdf",
      filePath: "/docs/Architecture.pdf",
    });
    const codeNote = makeNote({
      title: "scanner.py",
      fileType: "code",
      filePath: "/src/scanner.py",
    });
    const imgNote = makeNote({
      title: "diagram.png",
      fileType: "image",
      filePath: "/img/diagram.png",
    });
    const mdNote = makeNote({
      title: "Notes",
      fileType: "markdown",
      filePath: "/notes/notes.md",
    });

    const { rerender, container } = render(<NoteFileIcon note={pdfNote} />);
    expect(screen.getByText("PDF")).toHaveClass("note-tab-pdf-badge");

    rerender(<NoteFileIcon note={imgNote} />);
    expect(container.querySelector(".is-image-icon")).toBeInTheDocument();

    rerender(<NoteFileIcon note={codeNote} />);
    expect(container.querySelector(".is-code-icon")).toBeInTheDocument();

    rerender(<EditorNoteStatus note={codeNote} content={"a\nb\nc"} />);
    expect(screen.getByText("PYTHON")).toBeInTheDocument();
    expect(screen.getByText("3 lines")).toBeInTheDocument();

    rerender(<EditorNoteStatus note={codeNote} content={"a\nb"} compact />);
    expect(screen.getByText("2L")).toBeInTheDocument();

    rerender(<EditorNoteStatus note={pdfNote} content="" />);
    expect(screen.getByText("PDF Document")).toBeInTheDocument();

    rerender(<EditorNoteStatus note={pdfNote} content="" compact />);
    expect(screen.getByText("PDF")).toBeInTheDocument();

    rerender(<EditorNoteStatus note={imgNote} content="" compact />);
    expect(screen.getByText("IMG")).toBeInTheDocument();

    rerender(<EditorNoteStatus note={mdNote} content="one word" />);
    expect(screen.getByText("2 words")).toBeInTheDocument();

    rerender(<EditorNoteStatus note={mdNote} content="one" compact />);
    expect(screen.getByText("1w")).toBeInTheDocument();
  });

  it("ConnectedNotesFooter opens and unlinks linked note chips", () => {
    const linked: LinkedNoteInfo[] = [
      {
        topFolderId: "top-1",
        topFolderName: "Ops",
        subfolderNames: [],
        direction: "outgoing",
        note: makeNote({ id: "linked-2", title: "Target List" }),
      },
    ];
    const onOpenNote = vi.fn();
    const onUnlink = vi.fn();
    const parentClick = vi.fn();

    const { rerender } = render(
      <ConnectedNotesFooter
        linkedNotes={[]}
        onOpenNote={onOpenNote}
        onUnlink={onUnlink}
      />,
    );
    expect(screen.queryByText(/Connected notes/)).not.toBeInTheDocument();

    rerender(
      <div onClick={parentClick}>
        <ConnectedNotesFooter
          linkedNotes={linked}
          onOpenNote={onOpenNote}
          onUnlink={onUnlink}
          stopContainerClickPropagation
        />
      </div>,
    );

    fireEvent.click(screen.getByText("Target List"));
    expect(onOpenNote).toHaveBeenCalledWith("top-1", "linked-2");
    expect(parentClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    expect(onUnlink).toHaveBeenCalledWith("linked-2");
  });

  it("WorkspaceNotePicker filters workspace options and invokes onSelectOption", () => {
    const options: WorkspaceNoteOption[] = [
      {
        topFolderId: "f-1",
        topFolderName: "Engagement",
        subfolderNames: ["Recon"],
        note: makeNote({ id: "opt-1", title: "Subdomains" }),
      },
      {
        topFolderId: "f-2",
        topFolderName: "Archive",
        subfolderNames: [],
        note: makeNote({ id: "opt-2", title: "Credentials" }),
      },
    ];
    const onSelectOption = vi.fn();

    render(
      <WorkspaceNotePicker
        headerTitle="Pick a note"
        searchPlaceholder="Search notes..."
        emptyText="Nothing found"
        buttonClassName={(open) => `picker-btn ${open ? "is-open" : ""}`}
        buttonTitle="Pick note"
        buttonAriaLabel="Open picker"
        buttonContent={<span>Open</span>}
        options={options}
        isOptionActive={(opt) => opt.note.id === "opt-1"}
        onSelectOption={onSelectOption}
        closeOnSelect
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open picker" }));
    expect(screen.getByText("Subdomains")).toBeInTheDocument();
    expect(screen.getByText("Credentials")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search notes..."), {
      target: { value: "Archive" },
    });
    expect(screen.queryByText("Subdomains")).not.toBeInTheDocument();
    expect(screen.getByText("Credentials")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Credentials"));
    expect(onSelectOption).toHaveBeenCalledWith(options[1]);
    expect(
      screen.queryByPlaceholderText("Search notes..."),
    ).not.toBeInTheDocument();
  });

  it("SidebarResizer triggers drag start and double-click width reset", () => {
    const onStartDrag = vi.fn();
    const onResetWidth = vi.fn();

    render(
      <SidebarResizer
        isActive
        title="Drag to resize"
        onStartDrag={onStartDrag}
        onResetWidth={onResetWidth}
      />,
    );

    const separator = screen.getByRole("separator");
    expect(separator).toHaveClass("is-active");
    fireEvent.mouseDown(separator);
    fireEvent.touchStart(separator);
    expect(onStartDrag).toHaveBeenCalledTimes(2);
    fireEvent.doubleClick(separator);
    expect(onResetWidth).toHaveBeenCalledTimes(1);
  });

  it("NoteDocumentView switches viewers cleanly for markdown, loading/code, PDF, and images", () => {
    const onChangeTitle = vi.fn();
    const onChangeContent = vi.fn();
    const onOpenLinkedNote = vi.fn();
    const onUnlinkNote = vi.fn();

    const { rerender, container } = render(
      <NoteDocumentView
        note={makeNote({ id: "md-1", title: "Draft" })}
        content="Body text"
        isLoading={false}
        linkedNotes={[
          {
            topFolderId: "f-1",
            topFolderName: "Ops",
            subfolderNames: [],
            direction: "outgoing",
            note: makeNote({ id: "ref-1", title: "Ref" }),
          },
        ]}
        onChangeTitle={onChangeTitle}
        onChangeContent={onChangeContent}
        onOpenLinkedNote={onOpenLinkedNote}
        onUnlinkNote={onUnlinkNote}
      />,
    );

    const titleInput = screen.getByPlaceholderText("Note title...");
    fireEvent.change(titleInput, { target: { value: "Updated Title" } });
    expect(onChangeTitle).toHaveBeenCalledWith("Updated Title");
    expect(screen.getByText("Connected notes (1)")).toBeInTheDocument();

    rerender(
      <NoteDocumentView
        note={makeNote({ id: "code-1", title: "app.py", fileType: "code" })}
        content=""
        isLoading
        linkedNotes={[]}
        onChangeTitle={onChangeTitle}
        onChangeContent={onChangeContent}
        onOpenLinkedNote={onOpenLinkedNote}
        onUnlinkNote={onUnlinkNote}
      />,
    );
    expect(
      container.querySelector(".editor-loading-placeholder"),
    ).toBeInTheDocument();

    rerender(
      <NoteDocumentView
        note={makeNote({
          id: "pdf-1",
          title: "spec.pdf",
          fileType: "pdf",
          pdfData: "data:application/pdf;base64,JVBERi0xLjQ=",
        })}
        content=""
        isLoading={false}
        linkedNotes={[]}
        onChangeTitle={onChangeTitle}
        onChangeContent={onChangeContent}
        onOpenLinkedNote={onOpenLinkedNote}
        onUnlinkNote={onUnlinkNote}
      />,
    );
    expect(container.querySelector(".editor-pdf-full")).toBeInTheDocument();

    rerender(
      <NoteDocumentView
        note={makeNote({
          id: "img-1",
          title: "shot.png",
          fileType: "image",
          imageData: "data:image/png;base64,iVBORw0KGgo=",
        })}
        content=""
        isLoading={false}
        linkedNotes={[]}
        onChangeTitle={onChangeTitle}
        onChangeContent={onChangeContent}
        onOpenLinkedNote={onOpenLinkedNote}
        onUnlinkNote={onUnlinkNote}
      />,
    );
    expect(screen.getByRole("img", { name: "shot.png" })).toBeInTheDocument();
  });
});
