import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import accuracy_score, confusion_matrix, ConfusionMatrixDisplay
from sklearn.tree import DecisionTreeClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC

# ---------------------------------------------------
# 1. Load CSV
# ---------------------------------------------------
df = pd.read_csv("")

# ---------------------------------------------------
# 2. Auto-detect the target (MODE)
# ---------------------------------------------------
possible_targets = ["mode", "Mode", "MODE", "transport_mode"]

target_col = None
for col in df.columns:
    if col in possible_targets:
        target_col = col
        break

# If not found, detect non-numeric (categorical) column automatically
if target_col is None:
    for col in df.columns:
        if df[col].dtype == 'object':
            target_col = col
            break

print("Target column detected:", target_col)

# ---------------------------------------------------
# 3. Split + Encode
# ---------------------------------------------------
X = df.drop(columns=[target_col])
y = df[target_col]

label_encoder = LabelEncoder()
y = label_encoder.fit_transform(y)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# ---------------------------------------------------
# 4. Train 3 Models
# ---------------------------------------------------
models = {
    "Decision Tree": DecisionTreeClassifier(random_state=42),
    "KNN": KNeighborsClassifier(n_neighbors=5),
    "SVM": SVC(kernel="rbf", C=1)
}

accuracies = {}
predictions = {}

for name, model in models.items():
    if name == "Decision Tree":
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
    else:
        model.fit(X_train_scaled, y_train)
        preds = model.predict(X_test_scaled)

    predictions[name] = preds
    accuracies[name] = accuracy_score(y_test, preds)
    print(f"\n{name} Accuracy = {accuracies[name]:.4f}")

# ---------------------------------------------------
# 5. Accuracy Plot
# ---------------------------------------------------
plt.figure(figsize=(7, 5))
plt.bar(accuracies.keys(), accuracies.values())
plt.xlabel("Models")
plt.ylabel("Accuracy")
plt.title("Accuracy Comparison Between Models")
plt.tight_layout()
plt.show()

# ---------------------------------------------------
# 6. Confusion Matrices
# ---------------------------------------------------
for name in models:
    cm = confusion_matrix(y_test, predictions[name])
    disp = ConfusionMatrixDisplay(cm, display_labels=label_encoder.classes_)
    disp.plot(cmap="Blues")
    plt.title(f"{name} - Confusion Matrix")
    plt.show()

# ---------------------------------------------------
# 7. Feature Importance (Decision Tree)
# ---------------------------------------------------
dt_model = models["Decision Tree"]

importances = dt_model.feature_importances_
feature_names = X.columns

sorted_idx = np.argsort(importances)

plt.figure(figsize=(10, 6))
plt.barh(feature_names[sorted_idx], importances[sorted_idx])
plt.xlabel("Importance Score")
plt.title("Feature Importance (Decision Tree)")
plt.tight_layout()
plt.show()
