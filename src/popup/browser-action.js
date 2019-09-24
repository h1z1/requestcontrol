/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OptionsManager } from "../options/lib/OptionsManager.js";

const myOptionsManager = new OptionsManager();

function setRecords(records) {
    if (!records) {
        return;
    }

    let recordsList = document.getElementById("records");

    for (let i = records.length - 1; i >= 0; i--) {
        let item = newListItem(records[i]);
        recordsList.appendChild(item);
        item.dataset.record = i.toString();
        item.querySelector(".entry-header").addEventListener("click", function () {
            let details = document.getElementById("details");
            item.appendChild(details);
            showDetails(records[i]);
        });
    }
    recordsList.querySelector(".entry:first-child .entry-header").click();

    document.getElementById("records").classList.remove("hidden");
}

function getRule(uuid) {
    for (let rule of myOptionsManager.options.rules) {
        if (rule.uuid === uuid) {
            return rule;
        }
    }
    return null;
}

function newListItem(details) {
    let rule = getRule(details.rule.uuid);
    let model = document.getElementById("entryModel").cloneNode(true);
    model.removeAttribute("id");
    model.querySelector(".type").textContent = browser.i18n.getMessage(details.type);
    model.querySelector(".timestamp").textContent = timestamp(details.timestamp);
    model.querySelector(".icon").src = `/icons/icon-${rule.action}.svg`;
    model.querySelector(".action").textContent = browser.i18n.getMessage(`title_${rule.action}`);
    model.querySelector(".url").textContent = details.url;

    let tagsNode = model.querySelector(".tags");
    if (rule.tag) {
        tagsNode.textContent = decodeURIComponent(rule.tag);
    } else {
        tagsNode.parentNode.removeChild(tagsNode);
    }
    return model;
}

function timestamp(ms) {
    let d = new Date(ms);
    return padDigit(d.getHours(), 2) +
        ":" + padDigit(d.getMinutes(), 2) +
        ":" + padDigit(d.getSeconds(), 2) +
        "." + padDigit(d.getMilliseconds(), 3);
}

function padDigit(digit, padSize) {
    let str = digit.toString();
    let pad = padSize - str.length;
    if (pad > 0) {
        return "0".repeat(pad) + str;
    } else {
        return str;
    }
}

function showDetails(details) {
    document.getElementById("details").classList.remove("hidden");
    document.getElementById("url").textContent = details.url;
    if (details.target) {
        document.getElementById("target").textContent = details.target;
        document.getElementById("targetBlock").classList.remove("hidden");
    } else {
        document.getElementById("targetBlock").classList.add("hidden");
    }
    document.getElementById("editLink").href =
        browser.runtime.getURL("src/options/options.html") + `?edit=${details.rule.uuid}`;
}

function copyText(e) {
    let range = document.createRange();
    let text = document.getElementById(e.currentTarget.dataset.copyTarget);
    range.selectNodeContents(text);
    let selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("Copy");
    e.currentTarget.classList.add("copied");
}

function copied(e) {
    e.currentTarget.classList.remove("copied");
}

function openOptionsPage() {
    browser.runtime.openOptionsPage();
    window.close();
}

function toggleActive() {
    myOptionsManager.saveOption("disabled", !myOptionsManager.options.disabled);
    setEnabled(!myOptionsManager.options.disabled);
}

function setEnabled(enabled) {
    let button = document.getElementById("toggleActive");
    let textId = enabled ? "activate_false" : "activate_true";
    let titleId = enabled ? "disable_rules" : "enable_rules";
    button.classList.toggle("disabled", !enabled);
    button.textContent = browser.i18n.getMessage(textId);
    button.title = browser.i18n.getMessage(titleId);
}

document.addEventListener("DOMContentLoaded", function () {
    myOptionsManager.loadOptions().then(function () {
        if (myOptionsManager.options.disabled) {
            setEnabled(false);
            return Promise.reject("");
        } else {
            return browser.runtime.sendMessage(null);
        }
    }).then(records => {
        setEnabled(true);
        if (myOptionsManager.options.rules) {
            setRecords(records);
        }
        let copyButtons = document.getElementsByClassName("copyButton");
        for (let copyButton of copyButtons) {
            copyButton.addEventListener("click", copyText);
            copyButton.addEventListener("mouseleave", copied);
        }
    });

    document.getElementById("showRules").addEventListener("click", openOptionsPage);
    document.getElementById("toggleActive").addEventListener("click", toggleActive);
    document.getElementById("editLink").addEventListener("click", function (e) {
        e.preventDefault();
        browser.tabs.create({
            url: this.href
        });
        window.close();
    });
});
