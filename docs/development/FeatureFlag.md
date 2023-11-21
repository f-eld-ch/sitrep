# Feature Flags - Policy and Intended Purposes for Sitrep Development

## Why Feature Flags?
We intend to implement and use Feature Flags to enable continuous development and testing of Sitrep in one branch.
- Use case example: Development & testing of changes to existing features (e.g. a clock for the feed view of the Operation Journal).
- Use case example: A specific feature is requested by an organization, and they will beta-test it. Multiple features might be in development and tested by different users at the same time.
- Use case example: A/B-Testing of UI-components or processes.


## Sitrep Feature Flags Policy:
1. Responsibility for each Feature Flag and adherence to this policy lies with the developer implementing it.
2. Feature Flags shall only be implemented in frontend UI-elements, to enable or disable access to certain functionalities. 
3. No Feature Flags must be implemented in back-end code. However, this does not apply to backend API endpoints needed for frontend Feature Flags.
4. A list of all prior and currently active Feature Flags shall be kept (specifics tbd) and include at least the following information: intended Use Case, intended life-span, date implemented, date removed, @RedGecko/core-development member name.
5. The intended life-span of every Feature Flag must not exceed 3 months as of integration of the Feature Flag. Furthermore, it must be appropriately documented in the code using line comments and in the list (point 4). 
6. In case an extension of the life-span is warranted (at least 2 members of the development-team concur), the life-span may be prolonged once by a maximum of 3 months. The extension must be documented in the list (point 4). After this, no further extensions must be made.
7. If a Feature Flag is used for feature testing, the organization/user who requested the feature shall be the early-adopter for said feature. If no request was made, early-adopters are chosen by the development team.
8. When a Feature is released to all users, the corresponding Feature Flag shall be removed within the next 7 days, regardless if the intended life-span is up or not.
9. All members of @RedGecko/core-development must at all times have access to all features under Feature Flags irrespective of their status.