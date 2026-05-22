package api

import (
	"net/http"
)

func (a *App) handleSystemUpdate(w http.ResponseWriter, r *http.Request, _ Params) {
	payload := decodeMap(r)
	repoURL := firstNonEmpty(stringValue(payload, "repo_url"), a.cfg.SystemUpdateRepoURL)
	branch := firstNonEmpty(stringValue(payload, "branch"), a.cfg.SystemUpdateBranch, "main")
	restart := boolValue(payload, "restart_services", a.cfg.SystemUpdateRestartServices)
	dryRun := boolValue(payload, "dry_run", false)
	allowDirty := boolValue(payload, "allow_dirty", false)
	result := applyGitUpdate(r.Context(), repoURL, branch, restart, dryRun, allowDirty)
	if !boolish(result["success"]) {
		code := int(numeric(result["code"]))
		if code < 400 {
			code = http.StatusInternalServerError
		}
		writeJSON(w, code, false, asString(result["message"]), result)
		return
	}
	ok(w, asString(result["message"]), result)
}
