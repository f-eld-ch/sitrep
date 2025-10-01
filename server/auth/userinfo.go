package auth

type UserInfo struct {
	User              string `json:"user"`
	Name              string `json:"name,omitempty"`
	Email             string `json:"email"`
	PreferredUsername string `json:"preferredUsername"`
	IDToken           string `json:"idToken"`
	AccessToken       string `json:"-"`
	RefreshToken      string `json:"-"`
	SessionID         string `json:"-"`
}
