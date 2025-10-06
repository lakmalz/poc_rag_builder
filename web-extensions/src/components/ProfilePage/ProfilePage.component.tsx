import React, { useState } from "react";
import { Box, Typography, Avatar, TextField, Select, MenuItem, Button, FormControl, InputLabel, Grid } from "@mui/material";
import { ProfilePageProps, Gender } from "./ProfilePage.interface";
import useProfilePageStyles from "./ProfilePage.style";

const genders: Gender[] = ["Male", "Female", "Other"];

const ProfilePage: React.FC<ProfilePageProps> = ({
	user,
	onAccept,
	onEdit,
}) => {
	const classes = useProfilePageStyles();
	const [gender, setGender] = useState<Gender>(user.gender || "Other");
	const [editMode, setEditMode] = useState(false);
	const [form, setForm] = useState({
		name: user.name || "",
		address: user.address || "",
		country: user.country || "",
		telephone: user.telephone || "",
		gender: user.gender || "Other",
	});

	const handleChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
		const { name, value } = e.target;
		setForm((prev) => ({ ...prev, [name as string]: value }));
	};

	const handleGenderChange = (e: React.ChangeEvent<{ value: unknown }>) => {
		setGender(e.target.value as Gender);
		setForm((prev) => ({ ...prev, gender: e.target.value as Gender }));
	};

	const handleEdit = () => {
		setEditMode(true);
		if (onEdit) onEdit();
	};

	const handleAccept = () => {
		setEditMode(false);
		if (onAccept) onAccept(form);
	};

	return (
		<Box className={classes.root} sx={{ maxWidth: 500, mx: "auto", mt: 6, p: 4, borderRadius: 4, boxShadow: 3, bgcolor: "#f5f7fa" }}>
			<Typography variant="h4" align="center" gutterBottom sx={{ color: "#1976d2", fontWeight: 700 }}>
				User Profile
			</Typography>
			<Box display="flex" justifyContent="center" mb={3}>
				<Avatar src={user.picture} alt={form.name} sx={{ width: 100, height: 100, borderRadius: "50%", boxShadow: 2 }} />
			</Box>
			<Grid container spacing={2}>
				<Grid item xs={12}>
					<TextField
						label="User Name"
						name="name"
						value={form.name}
						onChange={handleChange}
						fullWidth
						disabled={!editMode}
						variant="outlined"
					/>
				</Grid>
				<Grid item xs={12}>
					<FormControl fullWidth variant="outlined">
						<InputLabel id="gender-label">Gender</InputLabel>
						<Select
							labelId="gender-label"
							name="gender"
							value={form.gender}
							onChange={handleGenderChange}
							label="Gender"
							disabled={!editMode}
						>
							{genders.map((g) => (
								<MenuItem key={g} value={g}>{g}</MenuItem>
							))}
						</Select>
					</FormControl>
				</Grid>
				<Grid item xs={12}>
					<TextField
						label="Address"
						name="address"
						value={form.address}
						onChange={handleChange}
						fullWidth
						disabled={!editMode}
						variant="outlined"
					/>
				</Grid>
				<Grid item xs={12}>
					<TextField
						label="Country"
						name="country"
						value={form.country}
						onChange={handleChange}
						fullWidth
						disabled={!editMode}
						variant="outlined"
					/>
				</Grid>
				<Grid item xs={12}>
					<TextField
						label="Telephone Number"
						name="telephone"
						value={form.telephone}
						onChange={handleChange}
						fullWidth
						disabled={!editMode}
						variant="outlined"
					/>
				</Grid>
			</Grid>
			<Box display="flex" justifyContent="space-between" mt={4}>
				<Button
					variant="contained"
					color="primary"
					onClick={handleAccept}
					sx={{ minWidth: 120, bgcolor: "#1976d2", fontWeight: 600 }}
					disabled={!editMode}
				>
					Accept
				</Button>
				<Button
					variant="outlined"
					color="secondary"
					onClick={handleEdit}
					sx={{ minWidth: 120, borderColor: "#1976d2", color: "#1976d2", fontWeight: 600 }}
					disabled={editMode}
				>
					Edit
				</Button>
			</Box>
		</Box>
	);
};

export default ProfilePage;