export type ConfirmRequest = {
  title: string;
  /** 確認してほしい内容。1 行ずつ出す。 */
  lines: string[];
  /** 目立たせる注意（例: 実行中の goal を置き換える）。 */
  warnings?: string[];
  confirmLabel: string;
  cancelLabel?: string;
};

/**
 * 確認の画面。送る側は、押された結果（true なら送る）だけを受け取る。
 * Enter キーでは送らない（ボタンを押す）。最初の焦点は取り消しに置く。
 */
export function requestConfirmation(request: ConfirmRequest, container: HTMLElement = document.body): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    const dialog = document.createElement("div");
    dialog.className = "confirm-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", request.title);

    const heading = document.createElement("h2");
    heading.textContent = request.title;
    dialog.append(heading);

    for (const warning of request.warnings ?? []) {
      const warningElement = document.createElement("p");
      warningElement.className = "confirm-warning";
      warningElement.textContent = warning;
      dialog.append(warningElement);
    }
    for (const line of request.lines) {
      const lineElement = document.createElement("p");
      lineElement.textContent = line;
      dialog.append(lineElement);
    }

    const finish = (isConfirmed: boolean) => {
      overlay.remove();
      resolve(isConfirmed);
    };

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.dataset["role"] = "cancel";
    cancelButton.textContent = request.cancelLabel ?? "取り消し";
    cancelButton.addEventListener("click", () => {
      finish(false);
    });

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.dataset["role"] = "confirm";
    confirmButton.className = "confirm-button";
    confirmButton.textContent = request.confirmLabel;
    confirmButton.addEventListener("click", () => {
      finish(true);
    });

    // Enter でボタンが押されるのを止める。Escape は取り消し。
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === "Escape") {
        finish(false);
      }
    });

    dialog.append(cancelButton, confirmButton);
    overlay.append(dialog);
    container.append(overlay);
    cancelButton.focus();
  });
}
