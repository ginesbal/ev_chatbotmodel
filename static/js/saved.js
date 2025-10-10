// saved vehicles functionality
(() => {
    const log = (...a) => console.info("[saved]", ...a);
    const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("saved-sync") : null;

    function showBubble(count) {
        const bubble = document.getElementById("savedCountBubble");
        if (!bubble) return;
        if (count > 0) {
            bubble.style.display = "inline-flex";
            bubble.textContent = String(count);
        } else {
            bubble.style.display = "none";
            bubble.textContent = "";
        }
    }

    function forEachHeartWithKey(key, fn, root = document) {
        const sel = `.heart-btn[data-key="${CSS.escape(String(key))}"]`;
        root.querySelectorAll(sel).forEach(fn);
    }

    function setHeartState(key, on, root = document) {
        forEachHeartWithKey(key, (btn) => {
            btn.setAttribute("aria-pressed", String(on));
            btn.classList.toggle("is-saved", !!on);
        }, root);
    }

    async function getState() {
        const res = await fetch("/api/saved", { headers: { "Accept": "application/json" } });
        if (!res.ok) throw new Error("GET /api/saved failed");
        return res.json(); // { keys, count }
    }

    async function addKey(key) {
        const res = await fetch(`/api/saved/${encodeURIComponent(key)}`, { method: "POST" });
        if (!res.ok) throw new Error("POST /api/saved failed");
        return res.json(); // { ok, count }
    }

    async function removeKey(key) {
        const res = await fetch(`/api/saved/${encodeURIComponent(key)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("DELETE /api/saved/{id} failed");
        return res.json(); // { ok, count }
    }

    async function clearAll() {
        const res = await fetch(`/api/saved`, { method: "DELETE" });
        if (!res.ok) throw new Error("DELETE /api/saved failed");
        return res.json(); // { ok, count:0 }
    }

    // click handler with optimistic updates
    function bindHearts(root = document) {
        root.querySelectorAll("[data-fav-btn].heart-btn").forEach((btn) => {
            if (btn.dataset.bound === "1") return;
            btn.dataset.bound = "1";

            btn.addEventListener("click", async () => {
                const key = btn.getAttribute("data-key");
                if (!key) return;

                const now = !(btn.getAttribute("aria-pressed") === "true");
                // optimistic toggle
                setHeartState(key, now);

                try {
                    const payload = now ? await addKey(key) : await removeKey(key);
                    showBubble(payload.count);

                    // update hearts with same key across the page
                    setHeartState(key, now);

                    // dispatch event for tab listeners
                    document.dispatchEvent(new CustomEvent("evision:favsChanged", {
                        detail: { size: payload.count, key, added: now }
                    }));

                    // cross-tab broadcast
                    if (bc) bc.postMessage({ type: "saved:changed", key, added: now, count: payload.count });
                } catch (e) {
                    // revert on failure
                    setHeartState(key, !now);
                    console.warn(e);
                }
            });

            // keyboard support
            btn.addEventListener("keydown", (e) => {
                if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    btn.click();
                }
            });
        });
    }

    async function init(root = document) {
        try {
            const state = await getState();
            showBubble(state.count);
            root.querySelectorAll(".heart-btn[data-key]").forEach((btn) => {
                const k = btn.getAttribute("data-key");
                const on = state.keys.includes(String(k));
                btn.setAttribute("aria-pressed", String(on));
                btn.classList.toggle("is-saved", !!on);
            });
        } catch (e) {
            console.warn(e);
        }
        bindHearts(root);
    }

    // expose for fragment reinitialization
    window.EVisonInitFavButtons = init;

    // clear all saved vehicles
    window.EVisonClearFavs = async function () {
        try {
            const data = await clearAll();
            showBubble(data.count);
            document.dispatchEvent(new CustomEvent("evision:favsChanged", { detail: { size: data.count } }));
            if (bc) bc.postMessage({ type: "saved:cleared", count: 0 });
        } catch (e) { console.warn("Clear favs failed", e); }
    };

    // cross-tab message receiver
    if (bc) {
        bc.onmessage = (ev) => {
            const msg = ev.data || {};
            if (msg.type === "saved:changed") {
                setHeartState(msg.key, !!msg.added);
                showBubble(msg.count ?? 0);
                document.dispatchEvent(new CustomEvent("evision:favsChanged", { detail: { size: msg.count ?? 0 } }));
            } else if (msg.type === "saved:cleared") {
                showBubble(0);
                document.dispatchEvent(new CustomEvent("evision:favsChanged", { detail: { size: 0 } }));
                document.querySelectorAll(".heart-btn[aria-pressed='true']").forEach((b) => {
                    b.setAttribute("aria-pressed", "false");
                    b.classList.remove("is-saved");
                });
            }
        };
    }

    // initialize on page load
    window.addEventListener("DOMContentLoaded", () => init(document));
    window.addEventListener("pageshow", () => init(document));
})();
