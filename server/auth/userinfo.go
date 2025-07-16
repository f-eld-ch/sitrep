package auth

type UserInfo struct {
	User              string `json:"user"`
	Email             string `json:"email"`
	PreferredUsername string `json:"preferredUsername"`
	IDToken           string `json:"idToken"`
	AccessToken       string `json:"-"`
}
