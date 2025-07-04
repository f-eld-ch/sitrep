import { render, screen, fireEvent } from "@testing-library/react";
import MessageContainer from "./Message";
import { vi } from "vitest";
import type { Message, Division } from "../../types";
import { Medium, PriorityStatus, TriageStatus } from "../../types";
import fc from "fast-check";

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

    it("renders with random message data (fast-check)", () => {
        fc.assert(
            fc.property(
                fc.record({
                    id: fc.uuid(),
                    sender: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
                    senderDetail: fc.string(),
                    receiver: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
                    receiverDetail: fc.string(),
                    time: fc.date(),
                    content: fc.string({ minLength: 10 }),
                    priorityId: fc.constantFrom(PriorityStatus.High, PriorityStatus.Normal),
                    triageId: fc.constantFrom(TriageStatus.Pending, TriageStatus.Triaged, TriageStatus.MoreInfo),
                    divisions: fc.constant([]),
                    createdAt: fc.date(),
                    updatedAt: fc.date(),
                    deletedAt: fc.date(),
                    mediumId: fc.constantFrom(Medium.Email, Medium.Phone, Medium.Radio),
                }),
                (msg) => {
                    render(
                        <MessageContainer
                            id={msg.id}
                            message={{ ...msg, divisions: [...msg.divisions] } as Message}
                            divisions={[]}
                            showControls={false}
                        />
                        , { reactStrictMode: false });
                    expect(screen.getByTestId(`sender-${msg.id}`).textContent).toBe(msg.sender);
                    expect(screen.getByTestId(`receiver-${msg.id}`).textContent).toBe(msg.receiver);
                }
            ),
            { numRuns: 100 }
        );
    });
});
