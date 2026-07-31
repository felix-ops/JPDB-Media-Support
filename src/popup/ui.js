import { getCardCount } from "../shared/messaging.js";

export function setupCombobox(selectId) {
  const selectElement = document.getElementById(selectId);
  if (!selectElement) return;

  const combobox = selectElement.previousElementSibling;
  const input = combobox.querySelector(".combobox-input");
  const optionsContainer = combobox.querySelector(".combobox-options");
  const arrow = combobox.querySelector(".combobox-arrow");

  function refreshOptions() {
    optionsContainer.innerHTML = "";
    Array.from(selectElement.options).forEach((option) => {
      const optionElement = document.createElement("div");
      optionElement.classList.add("combobox-option");
      optionElement.textContent = option.text;
      optionElement.dataset.value = option.value;

      optionElement.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = option.text;
        selectElement.value = option.value;
        optionsContainer.style.display = "none";
        selectElement.dispatchEvent(new Event("change"));
      });

      optionElement.addEventListener("touchend", (e) => {
        e.preventDefault();
        input.value = option.text;
        selectElement.value = option.value;
        optionsContainer.style.display = "none";
        selectElement.dispatchEvent(new Event("change"));
      });

      optionsContainer.appendChild(optionElement);
    });
  }

  function syncInputToSelect() {
    const selectedOption = selectElement.options[selectElement.selectedIndex];
    if (selectedOption) {
      input.value = selectedOption.text;
    } else {
      input.value = "";
    }
  }

  function filterOptions() {
    const filter = input.value.toLowerCase();
    optionsContainer
      .querySelectorAll(".combobox-option")
      .forEach((optionElement) => {
        const text = optionElement.textContent.toLowerCase();
        optionElement.style.display = text.includes(filter) ? "" : "none";
      });
  }

  input.addEventListener("focus", () => {
    optionsContainer.style.display = "block";
    optionsContainer
      .querySelectorAll(".combobox-option")
      .forEach((opt) => (opt.style.display = ""));
    input.select();
  });

  arrow.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const isVisible = getComputedStyle(optionsContainer).display === "block";
    if (isVisible) {
      optionsContainer.style.display = "none";
    } else {
      input.focus();
    }
  });

  arrow.addEventListener("touchend", (e) => {
    e.preventDefault();
    const isVisible = getComputedStyle(optionsContainer).display === "block";
    if (isVisible) {
      optionsContainer.style.display = "none";
    } else {
      input.focus();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      optionsContainer.style.display = "none";
      syncInputToSelect();
    }, 300);
  });

  input.addEventListener("input", filterOptions);
  selectElement.addEventListener("change", syncInputToSelect);

  const observer = new MutationObserver(() => {
    refreshOptions();
    syncInputToSelect();
  });
  observer.observe(selectElement, { childList: true });

  refreshOptions();
  syncInputToSelect();
}

export function populateFieldDropdown(selectId, fieldNames) {
  const selectElem = document.getElementById(selectId);
  selectElem.innerHTML = '<option value=""></option>';
  fieldNames.forEach((fieldName) => {
    const option = document.createElement("option");
    option.value = fieldName;
    option.text = fieldName;
    selectElem.appendChild(option);
  });
}

export async function updateCardCount() {
  const totalCardCountElem = document.getElementById("totalCardCount");
  if (totalCardCountElem) {
    const count = await getCardCount();
    totalCardCountElem.innerText = "Total Cards: " + count;
    totalCardCountElem.style.display = "flex";
  }
}
