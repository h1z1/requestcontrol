/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
    createMatchPatterns,
    createRule,
    ALL_URLS
} from "./RequestControl/api.js";
import { getNotifier } from "./notifier.js";
import { RequestController } from "./RequestControl/control.js";

/**
 * Background script for processing Request Control rules, adding request listeners and keeping
 * record of controlled requests.
 *
 * Request listener (webRequest.onBeforeListener) is added for each active rule. When request
 * matches a rule it will be marked for rule processing. The request is then resolved according
 * the marked rules.
 */

const requestListeners = [];
const controller = new RequestController();
const records = new Map();
let notifier;

browser.storage.local.get().then(async options => {
    notifier = await getNotifier();
    init(options);
    browser.storage.onChanged.addListener(initOnChange);
});

function init(options) {
    if (options.disabled) {
        notifier.disabledState(records);
        records.clear();
        controller.clear();
        browser.tabs.onRemoved.removeListener(removeRecords);
        browser.webNavigation.onCommitted.removeListener(resetRecords);
        browser.runtime.onMessage.removeListener(getRecords);
    } else {
        notifier.enabledState();
        addRuleListeners(options.rules);
        browser.tabs.onRemoved.addListener(removeRecords);
        browser.webNavigation.onCommitted.addListener(resetRecords);
        browser.runtime.onMessage.addListener(getRecords);
    }
    browser.webRequest.handlerBehaviorChanged();
}

function initOnChange() {
    while (requestListeners.length) {
        browser.webRequest.onBeforeRequest.removeListener(requestListeners.pop());
    }
    browser.webRequest.onBeforeRequest.removeListener(requestControlListener);
    browser.storage.local.get().then(init);
}

function addRuleListeners(rules) {
    if (!rules) {
        return;
    }
    for (let data of rules) {
        if (!data.active) {
            continue;
        }
        try {
            let rule = createRule(data);
            let urls = createMatchPatterns(data.pattern);
            let filter = {
                urls: urls,
                types: data.types
            };
            let listener = details => {
                controller.markRequest(details, rule);
            };
            browser.webRequest.onBeforeRequest.addListener(listener, filter);
            requestListeners.push(listener);
        } catch {
            notifier.error(null, browser.i18n.getMessage("error_invalid_rule"));
        }
    }
    browser.webRequest.onBeforeRequest.addListener(requestControlListener,
        { urls: [ALL_URLS] }, ["blocking"]);
}

function requestControlListener(request) {
    return controller.resolve(request, (request, updateTab = false) => {
        let tabRecordsCount = addRecord({
            tabId: request.tabId,
            type: request.type,
            url: request.url,
            target: request.redirectUrl,
            timestamp: request.timeStamp,
            rule: request.rule
        });
        notifier.notify(request.tabId, request.rule, tabRecordsCount);
        if (updateTab) {
            browser.tabs.update(request.tabId, {
                url: request.redirectUrl
            });
        }
    });
}

function getRecords() {
    return browser.tabs.query({
        currentWindow: true,
        active: true
    }).then(tabs => {
        return records.get(tabs[0].id);
    });
}

function removeRecords(tabId) {
    records.delete(tabId);
}

function addRecord(record) {
    let recordsForTab = records.get(record.tabId);
    if (!recordsForTab) {
        recordsForTab = [];
        records.set(record.tabId, recordsForTab);
    }
    recordsForTab.push(record);
    return recordsForTab.length;
}

function resetRecords(details) {
    if (details.frameId === 0 && records.has(details.tabId)) {
        let tabRecords = records.get(details.tabId);
        let isServerRedirect = details.transitionQualifiers.includes("server_redirect");
        let keep = [];
        let lastRecord;

        let i = 0;
        while (i < 5 && tabRecords.length > 0) {
            lastRecord = tabRecords.pop();
            if (lastRecord.target === details.url ||
                isServerRedirect && lastRecord.target) {
                keep.push(lastRecord);
                break;
            }
            i++;
        }

        let j = 0;
        while (j < 5 && tabRecords.length > 0) {
            let record = tabRecords.pop();
            if (record.target && record.target === lastRecord.url) {
                keep.unshift(record);
                lastRecord = record;
            }
            j++;
        }

        if (keep.length) {
            records.set(details.tabId, keep);
            notifier.notify(details.tabId, keep[keep.length - 1].rule, keep.length);
        } else {
            removeRecords(details.tabId);
            notifier.clear(details.tabId);
        }
    }
}
