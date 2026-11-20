import {
  AppBar,
  Box,
  Button,
  FormControl,
  InputLabel,
  Link as MuiLink,
  NativeSelect,
  OutlinedInput,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material'
import { useColorScheme } from '@mui/material/styles'
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Outlet,
} from '@tanstack/react-router'
import nomadMark from './assets/nomad-mark.svg'

function AppearanceSelect() {
  const { mode, setMode } = useColorScheme()

  return (
    <FormControl size="small" sx={{ minWidth: 108 }}>
      <InputLabel htmlFor="appearance">Appearance</InputLabel>
      <NativeSelect
        input={<OutlinedInput label="Appearance" id="appearance" />}
        value={mode ?? 'system'}
        onChange={(event) => {
          const value = event.target.value
          if (value === 'light' || value === 'dark' || value === 'system')
            setMode(value)
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </NativeSelect>
    </FormControl>
  )
}

function AppLayout() {
  return (
    <>
      <AppBar
        position="static"
        color="default"
        variant="elevation"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar
          disableGutters
          sx={{
            width: '100%',
            maxWidth: 1248,
            mx: 'auto',
            px: { xs: 2, sm: 4 },
            pt: { xs: 1.5, sm: 0 },
            columnGap: { xs: 2, md: 4 },
            flexWrap: 'wrap',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              py: 1,
              minWidth: 0,
              flex: { xs: 1, sm: '0 1 auto' },
            }}
          >
            <Box
              sx={{
                bgcolor: 'common.white',
                borderRadius: 1,
                display: 'flex',
                p: 0.5,
              }}
            >
              <img src={nomadMark} alt="" width={28} height={28} />
            </Box>
            <Typography sx={{ fontWeight: 700 }}>
              NOMAD Security Manager
            </Typography>
          </Box>
          <Stack
            component="nav"
            aria-label="Main navigation"
            direction="row"
            spacing={2.5}
            sx={{
              order: { xs: 1, sm: 0 },
              width: { xs: '100%', sm: 'auto' },
              alignSelf: 'stretch',
              flex: { sm: 1 },
              '& a': {
                color: 'text.secondary',
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 44,
                borderBottom: '2px solid transparent',
                fontWeight: 600,
              },
              '& a[aria-current="page"]': {
                borderBottomColor: 'primary.main',
                color: 'primary.main',
              },
            }}
          >
            <MuiLink
              component={Link}
              to="/"
              activeOptions={{ exact: true }}
              underline="none"
            >
              Home
            </MuiLink>
            <MuiLink component={Link} to="/repositories" underline="none">
              Repositories
            </MuiLink>
            <MuiLink component={Link} to="/component-preview" underline="none">
              Component preview
            </MuiLink>
          </Stack>
          <Box sx={{ ml: 'auto' }}>
            <AppearanceSelect />
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="main"
        sx={{
          maxWidth: 1248,
          mx: 'auto',
          px: { xs: 2, sm: 4 },
          py: { xs: 3, sm: 4 },
        }}
      >
        <Outlet />
      </Box>
    </>
  )
}

function HomePage() {
  return (
    <Paper sx={{ p: { xs: 2.5, sm: 4 } }}>
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="h1">NOMAD Security Manager</Typography>
        <Typography color="text.secondary">
          Review security checks across repositories in the NOMAD ecosystem.
        </Typography>
        <Button component={Link} to="/repositories" variant="contained">
          Manage repositories
        </Button>
      </Stack>
    </Paper>
  )
}

const rootRoute = createRootRoute({ component: AppLayout })
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})
const repositoriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/repositories',
  component: lazyRouteComponent(
    () => import('./RepositoriesPage'),
    'RepositoriesPage',
  ),
})
const previewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/component-preview',
  component: lazyRouteComponent(
    () => import('./ComponentPreview'),
    'ComponentPreview',
  ),
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([homeRoute, repositoriesRoute, previewRoute]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
