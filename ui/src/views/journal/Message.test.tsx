import { render, screen, fireEvent } from "@testing-library/react";
import MessageContainer from "./Message";
import { vi } from "vitest";
import type { Message, Division } from "../../types";
import { Medium, PriorityStatus, TriageStatus } from "../../types";

// Mock useTranslation
vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (key: string | string[]) => key, i18n: { language: "en" } }),
}));

// Mock useBooleanFlagValue
vi.mock("@openfeature/react-sdk", () => ({
    useBooleanFlagValue: () => true,
}));

// Mock dayjs
vi.mock("dayjs", () => {
    const actual = vi.importActual("dayjs");
    return {
        __esModule: true,
        default: Object.assign(
            (_date: unknown) => ({ format: () => "formatted-date", locale: () => ({ format: () => "formatted-date" }) }),
            { extend: vi.fn() }
        ),
        ...actual,
    };
});

describe("MessageContainer", () => {
    const baseMessage: Message = {
        id: "msg1",
        sender: "Alice",
        senderDetail: "HQ",
        receiver: "Bob",
        receiverDetail: "Field",
        time: new Date(),
        content: "**Hello** _World_",
        priorityId: PriorityStatus.High,
        triageId: TriageStatus.Pending,
        divisions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(0),
        mediumId: Medium.Email,
    };
    const divisions: Division[] = [];

    it("renders sender, receiver, and content", () => {
        render(
            <MessageContainer
                id="msg1"
                message={baseMessage}
                divisions={divisions}
                showControls={false}
            />
        );
        expect(screen.getByText("Alice")).toBeInTheDocument();
        expect(screen.getByText("Bob")).toBeInTheDocument();
        expect(screen.getByText("Hello", { exact: false })).toBeInTheDocument();
    });

    it("renders edit button and calls setEditorMessage", () => {
        const setEditorMessage = vi.fn();
        render(
            <MessageContainer
                id="msg1"
                message={baseMessage}
                divisions={divisions}
                showControls={true}
                setEditorMessage={setEditorMessage}
            />
        );
        fireEvent.click(screen.getByTestId("edit-button"));
        expect(setEditorMessage).toHaveBeenCalledWith(baseMessage);
    });

    it("renders print button if triaged", () => {
        render(
            <MessageContainer
                id="msg1"
                message={{ ...baseMessage, triageId: TriageStatus.Triaged }}
                divisions={divisions}
                showControls={true}
            />
        );
        expect(screen.getByTestId("print-button")).toBeInTheDocument();
    });

    it("renders save triage button and calls setTriageMessage", () => {
        const setTriageMessage = vi.fn();
        render(
            <MessageContainer
                id="msg1"
                message={baseMessage}
                divisions={divisions}
                showControls={true}
                setTriageMessage={setTriageMessage}
            />
        );
        fireEvent.click(screen.getByTestId("save-triage-button"));
        expect(setTriageMessage).toHaveBeenCalledWith(baseMessage);
    });

    it("renders create new task button if showTasks is true", () => {
        render(
            <MessageContainer
                id="msg1"
                message={baseMessage}
                divisions={divisions}
                showControls={true}
            />
        );
        fireEvent.click(screen.getByTestId("create-task-button"));
    });
});
